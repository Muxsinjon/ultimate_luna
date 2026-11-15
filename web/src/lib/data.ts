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
  return { eph: buildEphemeris(meta, new Float32Array(ephBuf)), sites, validation }
}

let terrainPromise: Promise<Terrain> | null = null

/** DEMs and long-term illumination overlays, for the polar map and custom sites. Cached. */
export function loadTerrain(): Promise<Terrain> {
  terrainPromise ??= (async () => {
    const [pm, pb, gm, gb, s, e] = await Promise.all([
      json<PolarDemMeta>('dem_polar.json'),
      bin('dem_polar.bin'),
      json<GlobalDemMeta>('dem_global.json'),
      bin('dem_global.bin'),
      bin('pgda_sun.bin').catch(() => null),
      bin('pgda_earth.bin').catch(() => null),
    ])
    return {
      polar: { meta: pm, h: new Int16Array(pb) },
      global: { meta: gm, h: new Int16Array(gb) },
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
  const step = shipped.shipStepH ?? 1
  const expected = (shipped.shipCount ?? shipped.count) * 6
  if (raw.length !== expected) throw new Error('Ephemeris file is incomplete')
  const rows = upsampleEphemeris(raw, step)
  const meta = { ...shipped, count: rows.length / 6 }
  return { meta, rows, endMs: meta.startMs + (meta.count - 1) * meta.stepMs }
}
