import checksums from './dataChecksums.json'
import type { GlobalDem } from './globalTerrain'
import { upsampleEphemeris } from './ephemeris'
// Loads the precomputed NASA-derived data shipped in public/data (see /pipeline).

export interface EphemMeta {
  startUtc: string
  startMs: number
  stepMs: number
  /** hourly rows after upsampling in the browser */
  count: number
  /** the shipped file keeps every shipStepH-th hour */
  shipStepH?: number
  shipCount?: number
  moonRadiusKm: number
  sunRadiusKm: number
  earthRadiusKm: number
  meanSunDistanceKm: number
  source: string
}

export interface Ephemeris {
  meta: EphemMeta
  /** rows x 6 : earth xyz (km, MOON_ME), sun unit xyz */
  rows: Float32Array
  endMs: number
}

export interface Site {
  id: string
  name: string
  group: string
  lat: number
  lon: number
  source: string
  verify: boolean
  elevationM: number
  horizon: number[]
  /** distance (km) of the terrain that sets the horizon at each azimuth (optional) */
  horizonDistKm?: number[]
  custom?: boolean
  terrainNote?: string
}

export interface SitesFile {
  azStepDeg: number
  maxDistanceKm: number
  observerHeightM: number
  terrain: string
  sites: Site[]
}

export interface PolarDemMeta {
  n: number
  scaleM: number
  offsetPx: number
  minLat: number
  source: string
}
export interface GlobalDemMeta {
  ppd: number
  rows: number
  cols: number
  source: string
}

export interface Validation {
  period: string
  worstElevationErrorDeg: number
  sites: { site: string; sun: { maxElevErrDeg: number }; earth: { maxElevErrDeg: number } }[]
  illumination?: {
    reference: string
    note: string
    sites: { site: string; oursSunPct: number; pgdaSunPct: number; oursEarthPct: number; pgdaEarthPct: number }[]
  }
  missions?: { mission: string; predicted: { event: string; utc: string }[]; sunAtLandingDeg: number; record: string }[]
}

export interface Terrain {
  polar: { meta: PolarDemMeta; h: Int16Array }
  global: { meta: GlobalDemMeta; h: Int16Array }
  pgda?: { sun: Uint8Array; earth: Uint8Array; n: number }
}

/** Core data needed for the first screen (about 2 MB). Terrain loads lazily via loadTerrain(). */
export interface AppData {
  eph: Ephemeris
  sites: SitesFile
  validation: Validation
}

const base = `${import.meta.env.BASE_URL}data/`
async function get(f: string): Promise<Response> {
  const r = await fetch(base + f)
  if (!r.ok) throw new Error(`Could not load ${f} (HTTP ${r.status})`)
  const expected = checksums[f as keyof typeof checksums]
  if (expected) {
    const bytes = await r.clone().arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
    if (hash !== expected) throw new Error(`Integrity check failed for ${f}. Reload to fetch the verified scientific data.`)
  }
  return r
}
const json = async <T>(f: string): Promise<T> => (await get(f)).json() as Promise<T>
const bin = async (f: string): Promise<ArrayBuffer> => (await get(f)).arrayBuffer()

export async function loadCore(): Promise<AppData> {
  const [meta, ephBuf, sites, validation] = await Promise.all([
    json<EphemMeta>('ephem.json'),
    bin('ephem.bin'),
    json<SitesFile>('sites.json'),
    json<Validation>('validation.json'),
  ])
  validateSites(sites)
  return { eph: buildEphemeris(meta, new Float32Array(ephBuf)), sites, validation }
}

export function validateSites(data: SitesFile) {
  if (!Number.isFinite(data.azStepDeg) || data.azStepDeg <= 0 || data.azStepDeg > 360 || !data.sites.length)
    throw new Error('Invalid site metadata')
  const ids = new Set<string>()
  for (const s of data.sites) {
    if (
      ids.has(s.id) ||
      !s.source ||
      !s.id ||
      !Number.isFinite(s.lat) ||
      Math.abs(s.lat) > 90 ||
      !Number.isFinite(s.lon) ||
      s.lon < 0 ||
      s.lon >= 360 ||
      !Number.isFinite(s.elevationM) ||
      s.horizon.length !== Math.round(360 / data.azStepDeg) ||
      !s.horizon.every(Number.isFinite)
    )
      throw new Error(`Invalid coordinates or horizon data for ${s.id}`)
    ids.add(s.id)
  }
}

let globalPromise: Promise<GlobalDem> | null = null
export function loadGlobalDem(): Promise<GlobalDem> {
  globalPromise ??= Promise.all([json<GlobalDemMeta>('dem_global.json'), bin('dem_global.bin')])
    .then(([meta, bytes]) => {
      if (!(meta.ppd > 0) || meta.rows !== 180 * meta.ppd || meta.cols !== 360 * meta.ppd || bytes.byteLength !== meta.rows * meta.cols * 2)
        throw new Error('Global LOLA grid is incomplete or has invalid dimensions')
      return { meta, h: new Int16Array(bytes) }
    })
    .catch((e) => {
      globalPromise = null
      throw e
    })
  return globalPromise
}

let terrainPromise: Promise<Terrain> | null = null

/** DEMs and long-term illumination overlays, for the polar map and custom sites. Cached. */
export function loadTerrain(): Promise<Terrain> {
  terrainPromise ??= (async () => {
    const [pm, pb, global, s, e] = await Promise.all([
      json<PolarDemMeta>('dem_polar.json'),
      bin('dem_polar.bin'),
      loadGlobalDem(),
      bin('pgda_sun.bin').catch(() => null),
      bin('pgda_earth.bin').catch(() => null),
    ])
    if (!Number.isInteger(pm.n) || pm.n < 2 || !(pm.scaleM > 0) || pb.byteLength !== pm.n * pm.n * 2)
      throw new Error('Polar LOLA grid is incomplete')
    if ((s && s.byteLength !== pm.n * pm.n) || (e && e.byteLength !== pm.n * pm.n))
      throw new Error('Polar illumination overlay is incomplete')
    return {
      polar: { meta: pm, h: new Int16Array(pb) },
      global,
      pgda: s && e ? { sun: new Uint8Array(s), earth: new Uint8Array(e), n: pm.n } : undefined,
    }
  })().catch((err) => {
    terrainPromise = null
    throw err
  })
  return terrainPromise
}

/** Expand the shipped ephemeris to hourly rows and fix up the metadata. */
export function buildEphemeris(shipped: EphemMeta, raw: Float32Array): Ephemeris {
  if (
    !Number.isFinite(shipped.startMs) ||
    Date.parse(shipped.startUtc) !== shipped.startMs ||
    shipped.stepMs !== 3600000 ||
    !Number.isInteger(shipped.count) ||
    shipped.count < 2
  )
    throw new Error('Invalid ephemeris metadata: hourly UTC samples are required')
  if (!raw.every(Number.isFinite)) throw new Error('Ephemeris contains missing or nonfinite observations')
  for (let i = 0; i < raw.length; i += 6) {
    if (
      Math.hypot(raw[i], raw[i + 1], raw[i + 2]) < 300000 ||
      Math.hypot(raw[i], raw[i + 1], raw[i + 2]) > 450000 ||
      Math.abs(Math.hypot(raw[i + 3], raw[i + 4], raw[i + 5]) - 1) > 0.001
    )
      throw new Error('Ephemeris vectors have invalid units or directions')
  }
  const step = shipped.shipStepH ?? 1
  const expected = (shipped.shipCount ?? shipped.count) * 6
  if (raw.length !== expected) throw new Error('Ephemeris file is incomplete')
  const rows = upsampleEphemeris(raw, step)
  const meta = { ...shipped, count: rows.length / 6 }
  return { meta, rows, endMs: meta.startMs + (meta.count - 1) * meta.stepMs }
}
