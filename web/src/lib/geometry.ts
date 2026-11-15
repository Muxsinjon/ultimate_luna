// Lunar surface geometry. Mirrors pipeline/lunar_geom.py (validated vs JPL Horizons).
// Frame: MOON_ME body-fixed, east-longitude positive, sphere R = 1737.4 km.

export type Vec3 = [number, number, number]
export const D2R = Math.PI / 180
export const R2D = 180 / Math.PI
export const R_MOON_KM = 1737.4

export function unitVec(lonDeg: number, latDeg: number): Vec3 {
  const lo = lonDeg * D2R
  const la = latDeg * D2R
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]
}

export interface Basis {
  e: Vec3
  n: Vec3
  u: Vec3
}

export function enuBasis(lonDeg: number, latDeg: number): Basis {
  const lo = lonDeg * D2R
  const la = latDeg * D2R
  return {
    e: [-Math.sin(lo), Math.cos(lo), 0],
    n: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)],
    u: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)],
  }
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Azimuth (deg clockwise from north) and elevation (deg) of vector v at a site. */
export function azEl(v: Vec3, b: Basis): { az: number; el: number } {
  const ve = dot(v, b.e)
  const vn = dot(v, b.n)
  const vu = dot(v, b.u)
  let az = Math.atan2(ve, vn) * R2D
  if (az < 0) az += 360
  const el = Math.atan2(vu, Math.sqrt(ve * ve + vn * vn)) * R2D
  return { az, el }
}

/** Great-circle destination point. */
export function destination(latDeg: number, lonDeg: number, azDeg: number, distKm: number): [number, number] {
  const p1 = latDeg * D2R
  const l1 = lonDeg * D2R
  const th = azDeg * D2R
  const d = distKm / R_MOON_KM
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th))
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2))
  let lon = l2 * R2D
  lon = ((((lon + 180) % 360) + 360) % 360) - 180
  return [p2 * R2D, lon]
}

/** Horizon elevation at azimuth `az` by linear interpolation of a mask sampled every `step` degrees. */
export function horizonAt(mask: ArrayLike<number>, step: number, az: number): number {
  const n = mask.length
  const f = (((az % 360) + 360) % 360) / step
  const i = Math.floor(f) % n
  const w = f - Math.floor(f)
  return mask[i] * (1 - w) + mask[(i + 1) % n] * w
}
