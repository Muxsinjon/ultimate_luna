import { polarXY } from './terrain'
export type AnalysisLayer = 'elevation' | 'slope' | 'roughness' | 'hazard'
export type CriteriaState = 'meets' | 'exceeds' | 'insufficient'
export interface HazardMeta {
  version: number
  width: number
  height: number
  x0: number
  y0: number
  dx: number
  dy: number
  quantum: number
  noData: number
  officialComparison: { rmsDifferenceDeg: number; maxAbsDifferenceDeg: number }
  slopeSupportM: number
  roughnessSupportM: number
  sourceSha256: string
  assets: Record<'slope' | 'roughness', { file: string; sha256: string }>
}
export interface HazardData {
  meta: HazardMeta
  slope: Uint16Array
  roughness: Uint16Array
}
export interface Criteria {
  slope: number
  roughness: number
}
export function criteriaValid(c: Criteria) {
  return Number.isFinite(c.slope) && c.slope >= 0 && c.slope <= 90 && Number.isFinite(c.roughness) && c.roughness >= 0
}
export function classify(s: number | null, r: number | null, c: Criteria): CriteriaState {
  if (s === null || r === null || !Number.isFinite(s) || !Number.isFinite(r) || !criteriaValid(c)) return 'insufficient'
  return s <= c.slope && r <= c.roughness ? 'meets' : 'exceeds'
}
export function valuesAtIndex(d: HazardData, i: number) {
  const valid = i >= 0 && i < d.slope.length
  return {
    slope: valid && d.slope[i] !== d.meta.noData ? d.slope[i] * d.meta.quantum : null,
    roughness: valid && d.roughness[i] !== d.meta.noData ? d.roughness[i] * d.meta.quantum : null,
  }
}
export function analysisAt(d: HazardData, lat: number, lon: number) {
  const p = polarXY(lat, lon),
    m = d.meta,
    c = 0 + Math.round((p.x - m.x0) / m.dx),
    r = 0 + Math.round((p.y - m.y0) / m.dy)
  if (c < 0 || r < 0 || c >= m.width || r >= m.height) return { ...valuesAtIndex(d, -1), row: r, col: c }
  return { ...valuesAtIndex(d, r * m.width + c), row: r, col: c }
}
/** Sample-centre disk geometry; outside-raster samples count as unavailable, never favorable. */
export function footprint(d: HazardData, lat: number, lon: number, radiusM: number, elevationM: number, c: Criteria) {
  const m = d.meta,
    p = polarXY(lat, lon),
    scale = (1 + (p.x * p.x + p.y * p.y) / (4 * 1737400 ** 2)) / (1 + elevationM / 1737400)
  const radius = radiusM * scale
  if (!Number.isFinite(radius) || radiusM < 5 || radiusM > 2000) return null
  let total = 0,
    valid = 0,
    meets = 0,
    sumS = 0,
    sumR = 0,
    minS = Infinity,
    maxS = -Infinity,
    minR = Infinity,
    maxR = -Infinity
  for (let row = Math.ceil((p.y + radius - m.y0) / m.dy); row <= Math.floor((p.y - radius - m.y0) / m.dy); row++)
    for (let col = Math.ceil((p.x - radius - m.x0) / m.dx); col <= Math.floor((p.x + radius - m.x0) / m.dx); col++) {
      if ((m.x0 + col * m.dx - p.x) ** 2 + (m.y0 + row * m.dy - p.y) ** 2 > radius ** 2) continue
      total++
      if (row < 0 || col < 0 || row >= m.height || col >= m.width) continue
      const v = valuesAtIndex(d, row * m.width + col)
      if (v.slope === null || v.roughness === null) continue
      valid++
      sumS += v.slope
      sumR += v.roughness
      minS = Math.min(minS, v.slope)
      maxS = Math.max(maxS, v.slope)
      minR = Math.min(minR, v.roughness)
      maxR = Math.max(maxR, v.roughness)
      if (classify(v.slope, v.roughness, c) === 'meets') meets++
    }
  return {
    total,
    valid,
    meets,
    coveragePct: total ? (valid / total) * 100 : 0,
    meetsPct: valid && criteriaValid(c) ? (meets / valid) * 100 : null,
    slope: valid ? { min: minS, max: maxS, mean: sumS / valid } : null,
    roughness: valid ? { min: minR, max: maxR, mean: sumR / valid } : null,
    projectedRadiusM: radius,
  }
}
export async function loadHazards(signal: AbortSignal, siteId = 'site01'): Promise<HazardData> {
  const base = `${import.meta.env.BASE_URL}data/terrain/${siteId}/hazards/`
  const response = await fetch(base + 'hazards.json', { signal })
  if (!response.ok) throw new Error('Scientific hazard metadata unavailable')
  const meta: HazardMeta = await response.json()
  if (
    meta.version !== 1 ||
    !Number.isInteger(meta.width) ||
    !Number.isInteger(meta.height) ||
    meta.width < 3 ||
    meta.height < 3 ||
    meta.width > 4001 ||
    meta.height > 4001 ||
    meta.dx !== 5 ||
    meta.dy !== -5 ||
    meta.quantum !== 0.001 ||
    meta.noData !== 65535
  )
    throw new Error('Unsupported hazard georeferencing/encoding')
  const load = async (key: 'slope' | 'roughness') => {
    const r = await fetch(base + meta.assets[key].file, { signal })
    if (!r.ok) throw new Error(`Scientific ${key} unavailable`)
    const b = await r.arrayBuffer(),
      hash = await crypto.subtle.digest('SHA-256', b)
    if (Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, '0')).join('') !== meta.assets[key].sha256)
      throw new Error('Hazard asset checksum mismatch')
    if (b.byteLength !== meta.width * meta.height * 2) throw new Error('Truncated hazard asset')
    const a = new Uint16Array(meta.width * meta.height),
      v = new DataView(b)
    for (let i = 0; i < a.length; i++) a[i] = v.getUint16(i * 2, true)
    return a
  }
  const [slope, roughness] = await Promise.all([load('slope'), load('roughness')])
  return { meta, slope, roughness }
}
