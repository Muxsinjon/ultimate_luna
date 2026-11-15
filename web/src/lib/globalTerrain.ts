import type { GlobalDemMeta } from './data'
import { R_MOON_KM } from './geometry'

export type GlobalDem = { meta: GlobalDemMeta; h: Int16Array }
/** Bilinear sampling of cell-centred, east-positive LOLA cylindrical elevations in metres.
 * Longitude wraps. At the poles, average the limiting latitude row to close a single pole vertex.
 */
export function globalElevation({ meta: m, h }: GlobalDem, lat: number, lon: number): number {
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon)) throw new RangeError('Invalid lunar location')
  if (Math.abs(lat) === 90) {
    const offset = lat > 0 ? 0 : (m.rows - 1) * m.cols
    let sum = 0
    for (let c = 0; c < m.cols; c++) sum += h[offset + c]
    return sum / m.cols
  }
  const row = Math.max(0, Math.min(m.rows - 1, (90 - lat) * m.ppd - 0.5))
  const col = (((lon % 360) + 360) % 360) * m.ppd - 0.5
  const r = Math.min(m.rows - 2, Math.floor(row)),
    c = Math.floor(col)
  const fr = row - r,
    fc = col - c
  const c0 = ((c % m.cols) + m.cols) % m.cols,
    c1 = (c0 + 1) % m.cols
  return (
    (h[r * m.cols + c0] * (1 - fc) + h[r * m.cols + c1] * fc) * (1 - fr) +
    (h[(r + 1) * m.cols + c0] * (1 - fc) + h[(r + 1) * m.cols + c1] * fc) * fr
  )
}
/** True radial scale; no vertical exaggeration. */
export function lunarDisplayRadius(elevationM: number): number {
  if (!Number.isFinite(elevationM) || Math.abs(elevationM) > 20000) throw new RangeError('Invalid LOLA elevation')
  return 1 + elevationM / (R_MOON_KM * 1000)
}
