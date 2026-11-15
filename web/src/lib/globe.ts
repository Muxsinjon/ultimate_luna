import type { Vec3 } from './geometry'
import { normalizeLon360 } from './physics/lon'

/** Three.js globe: +X = 0°E, +Y = north pole, -Z = 90°E. Texture seam is 180°. */
export function globePoint(lat: number, lon: number, radius = 1): Vec3 {
  const p = (lat * Math.PI) / 180,
    l = (lon * Math.PI) / 180
  return [radius * Math.cos(p) * Math.cos(l), radius * Math.sin(p), -radius * Math.cos(p) * Math.sin(l)]
}
export function globeCoordinates([x, y, z]: Vec3) {
  const radius = Math.hypot(x, y, z)
  if (!(radius > 0) || !Number.isFinite(radius)) throw new RangeError('Invalid globe point')
  return {
    lat: (Math.asin(Math.max(-1, Math.min(1, y / radius))) * 180) / Math.PI,
    lon: normalizeLon360((Math.atan2(-z, x) * 180) / Math.PI),
  }
}
/** Transform a MOON_ME direction to the display frame without changing its length. */
export const moonToGlobe = ([x, y, z]: Vec3): Vec3 => [x, z, -y]
