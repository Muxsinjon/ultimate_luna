import { D2R, enuBasis, unitVec, type Vec3 } from './geometry'
import { polarXY, polarLatLon } from './terrain'

export interface SurfacePoint {
  lat: number
  lon: number
  elevationM: number
}
interface AssetFile {
  file: string
  sha256: string
  min: number
  max: number
  median: number
}
export interface TerrainMeta {
  version: number
  /** present for sites built by the generalised Milestone 3 pipeline */
  siteId?: string
  name?: string
  product?: string
  plannerId?: string
  centreSource?: string
  width: number
  height: number
  x0: number
  y0: number
  dx: number
  dy: number
  radiusM: number
  projection: string
  frame: string
  origin: { lat: number; lon: number }
  sourceResolutionM: number
  assets: { surf: AssetFile; toterr: AssetFile }
  decimationResidualM: { rms: number; p95Abs: number; maxAbs: number }
  uncertaintyNote: string
  sources: Record<string, { url: string; file: string; sha256: string }>
  imagery: null | { file: string; sha256: string; title: string; url: string; note: string }
}
export interface TerrainAsset {
  meta: TerrainMeta
  heights: Float32Array
  errors: Float32Array
  imageUrl: string | null
}
const R = 1737400
export const terrainRoot = `${import.meta.env.BASE_URL}data/terrain/`
/** Asset directory of one processed site (Milestone 1 used Site01 only). */
export const terrainBase = (siteId = 'site01') => `${terrainRoot}${siteId}/`

/** One entry of web/public/data/terrain/index.json, written by pipeline/terrain_sites.py. */
export interface TerrainSiteInfo {
  id: string
  name: string
  product: string
  readmeName: string
  plannerId: string
  centre: { lat: number; lon: number }
  centreSource: string
  extentM: [number, number]
  meshSpacingM: number
  nativeSpacingM: number
  sourceUrl: string
  sourceSha256: string
}
export interface TerrainIndex {
  version: number
  product: string
  citation: string
  method: string
  sites: TerrainSiteInfo[]
}
export async function loadTerrainIndex(signal?: AbortSignal): Promise<TerrainIndex> {
  const r = await fetch(terrainRoot + 'index.json', { signal })
  if (!r.ok) throw new Error(`Could not load the processed terrain site list (HTTP ${r.status})`)
  const index: TerrainIndex = await r.json()
  if (index.version !== 1 || !Array.isArray(index.sites) || !index.sites.length) throw new Error('Unsupported terrain site list')
  return index
}

export function validateTerrain(asset: TerrainAsset) {
  const { meta: m, heights, errors } = asset
  if (
    m.version !== 1 ||
    m.radiusM !== R ||
    m.projection !== 'south-polar-stereographic' ||
    ![m.width, m.height].every((n) => Number.isInteger(n) && n >= 2 && n <= 1025) ||
    ![m.x0, m.y0, m.dx, m.dy, m.origin.lat, m.origin.lon].every(Number.isFinite) ||
    m.dx <= 0 ||
    m.dy >= 0 ||
    heights.length !== m.width * m.height ||
    errors.length !== heights.length ||
    !heights.some(Number.isFinite)
  ) {
    throw new Error('Unsupported or incomplete lunar terrain asset')
  }
}
/** Never clamp coordinates or bridge NoData gaps. Grid values are radial elevations/RMS errors. */
export function sampleGrid(asset: TerrainAsset, lat: number, lon: number, values = asset.heights): number | null {
  const { meta: m } = asset,
    { x, y } = polarXY(lat, lon)
  const c = (x - m.x0) / m.dx,
    r = (y - m.y0) / m.dy
  if (![c, r].every(Number.isFinite) || c < -1e-8 || r < -1e-8 || c > m.width - 1 + 1e-8 || r > m.height - 1 + 1e-8) return null
  const c0 = Math.max(0, Math.min(m.width - 2, Math.floor(c))),
    r0 = Math.max(0, Math.min(m.height - 2, Math.floor(r)))
  const a = [values[r0 * m.width + c0], values[r0 * m.width + c0 + 1], values[(r0 + 1) * m.width + c0], values[(r0 + 1) * m.width + c0 + 1]]
  if (!a.every(Number.isFinite)) return null
  const fc = Math.max(0, Math.min(1, c - c0)),
    fr = Math.max(0, Math.min(1, r - r0))
  return (a[0] * (1 - fc) + a[1] * fc) * (1 - fr) + (a[2] * (1 - fc) + a[3] * fc) * fr
}
/** Curved lunar surface in metres, local X east, Y up, Z south. */
export function surfaceToLocal(p: SurfacePoint, origin: SurfacePoint): Vec3 {
  const b = enuBasis(origin.lon, origin.lat),
    u = unitVec(p.lon, p.lat),
    o = unitVec(origin.lon, origin.lat)
  const v = u.map((n, i) => n * (R + p.elevationM) - o[i] * (R + origin.elevationM))
  const dot = (a: Vec3) => v.reduce((s, n, i) => s + n * a[i], 0)
  return [dot(b.e), dot(b.u), -dot(b.n)]
}
export function localToSurface(p: Vec3, origin: SurfacePoint): SurfacePoint {
  const b = enuBasis(origin.lon, origin.lat),
    u = unitVec(origin.lon, origin.lat)
  const v = u.map((n, i) => n * (R + origin.elevationM) + b.e[i] * p[0] + b.u[i] * p[1] - b.n[i] * p[2])
  return {
    lat: Math.atan2(v[2], Math.hypot(v[0], v[1])) / D2R,
    lon: (((Math.atan2(v[1], v[0]) / D2R) % 360) + 360) % 360,
    elevationM: Math.hypot(...v) - R,
  }
}
export function meshArrays(asset: TerrainAsset) {
  validateTerrain(asset)
  const { meta: m, heights: h } = asset
  const origin = { ...m.origin, elevationM: sampleGrid(asset, m.origin.lat, m.origin.lon) ?? 0 }
  const positions = new Float32Array(h.length * 3),
    uv = new Float32Array(h.length * 2),
    indices: number[] = []
  for (let r = 0; r < m.height; r++)
    for (let c = 0; c < m.width; c++) {
      const i = r * m.width + c,
        ll = polarLatLon(m.x0 + c * m.dx, m.y0 + r * m.dy)
      positions.set(surfaceToLocal({ ...ll, elevationM: Number.isFinite(h[i]) ? h[i] : 0 }, origin), i * 3)
      uv.set([c / (m.width - 1), 1 - r / (m.height - 1)], i * 2)
    }
  for (let r = 0; r < m.height - 1; r++)
    for (let c = 0; c < m.width - 1; c++) {
      const a = r * m.width + c,
        b = a + 1,
        d = a + m.width,
        e = d + 1
      for (const tri of [
        [a, d, b],
        [b, d, e],
      ])
        if (tri.every((i) => Number.isFinite(h[i]))) indices.push(...tri)
    }
  if (!indices.length) throw new Error('No valid terrain triangles')
  return { origin, positions, uv, indices: new Uint32Array(indices) }
}
export async function checkedFile(base: string, file: { file: string; sha256: string }, signal?: AbortSignal) {
  const r = await fetch(base + file.file, { signal })
  if (!r.ok) throw new Error(`Could not load terrain ${file.file} (HTTP ${r.status})`)
  const bytes = await r.arrayBuffer(),
    hash = await crypto.subtle.digest('SHA-256', bytes)
  if (Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('') !== file.sha256)
    throw new Error('Terrain checksum mismatch')
  return bytes
}
function decode(bytes: ArrayBuffer) {
  if (bytes.byteLength % 4) throw new Error('Truncated terrain file')
  const view = new DataView(bytes),
    out = new Float32Array(bytes.byteLength / 4)
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true)
  return out
}
export async function loadTerrainAsset(signal?: AbortSignal, siteId = 'site01'): Promise<TerrainAsset> {
  const base = terrainBase(siteId)
  const r = await fetch(base + 'terrain.json', { signal })
  if (!r.ok) throw new Error(`Could not load terrain metadata (HTTP ${r.status})`)
  const meta: TerrainMeta = await r.json()
  const [h, e, image] = await Promise.all([
    checkedFile(base, meta.assets.surf, signal),
    checkedFile(base, meta.assets.toterr, signal),
    meta.imagery ? checkedFile(base, meta.imagery, signal) : null,
  ])
  const asset = { meta, heights: decode(h), errors: decode(e), imageUrl: null as string | null }
  validateTerrain(asset)
  if (meta.siteId !== undefined && meta.siteId !== siteId) throw new Error('Terrain asset belongs to a different site')
  if (image) asset.imageUrl = URL.createObjectURL(new Blob([image], { type: 'image/jpeg' }))
  return asset
}

/**
 * The processed terrain site whose crop contains (lat, lon): the planner site linked by `plannerId` first,
 * otherwise the first crop whose map-plane extent (centre ± extent/2) contains the point. Null = no terrain;
 * nothing is extrapolated outside a crop.
 */
export function terrainSiteFor(sites: TerrainSiteInfo[], plannerId: string, lat: number, lon: number): TerrainSiteInfo | null {
  const linked = sites.find((t) => t.plannerId === plannerId)
  if (linked) return linked
  if (![lat, lon].every(Number.isFinite) || lat > -60) return null
  const p = polarXY(lat, lon)
  return (
    sites.find((t) => {
      const c = polarXY(t.centre.lat, t.centre.lon)
      return Math.abs(p.x - c.x) <= t.extentM[0] / 2 && Math.abs(p.y - c.y) <= t.extentM[1] / 2
    }) ?? null
  )
}

/**
 * Milestone 4: a MOON_ME direction (any length) expressed in the mesh's local frame (X east, Y up, Z south at the
 * crop origin), normalised. Near the pole local north rotates across an 8 km crop, so directions must use the
 * mesh origin's basis, not the azimuth measured at the site.
 */
export function bodyDirectionToLocal(v: Vec3, origin: { lat: number; lon: number }): Vec3 {
  const b = enuBasis(origin.lon, origin.lat)
  const dot = (a: Vec3) => v[0] * a[0] + v[1] * a[1] + v[2] * a[2]
  const out: Vec3 = [dot(b.e), dot(b.u), -dot(b.n)]
  const n = Math.hypot(...out)
  if (!(n > 0)) throw new RangeError('zero direction')
  return [out[0] / n, out[1] / n, out[2] / n]
}
