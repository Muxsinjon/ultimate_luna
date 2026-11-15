// Real star directions (NASA HEASARC Yale Bright Star Catalogue, J2000) expressed in the Moon's MOON_ME frame for a date.
// MOON_ME's z axis lies within 1.54° of the ecliptic pole, so: equatorial -> ecliptic (obliquity 23.44°), then a rotation
// about the pole that puts the Sun's ecliptic longitude on the ephemeris Sun direction. Accuracy about ±2° (display only).
import type { Vec3 } from './geometry'

const D2R = Math.PI / 180
const OBLIQUITY = 23.4393 * D2R

/** Apparent ecliptic longitude of the Sun (rad), low-precision formula (~0.01°). */
export function sunEclipticLongitude(tMs: number): number {
  const d = tMs / 86_400_000 + 2440587.5 - 2451545.0
  const g = (357.528 + 0.9856003 * d) * D2R
  return (280.46 + 0.9856474 * d + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R
}

/** Unit vectors (MOON_ME) for catalogue stars [raDeg, decDeg, ...]; `sun` is the MOON_ME unit vector toward the Sun. */
export function starsMoonME(stars: number[][], sun: Vec3, tMs: number): Float32Array {
  const delta = Math.atan2(sun[1], sun[0]) - sunEclipticLongitude(tMs)
  const out = new Float32Array(stars.length * 3)
  const ce = Math.cos(OBLIQUITY),
    se = Math.sin(OBLIQUITY)
  stars.forEach(([ra, dec], i) => {
    const a = ra * D2R,
      d = dec * D2R
    const x = Math.cos(d) * Math.cos(a),
      y = Math.cos(d) * Math.sin(a),
      z = Math.sin(d)
    const ye = y * ce + z * se,
      ze = -y * se + z * ce
    const lon = Math.atan2(ye, x) + delta,
      cb = Math.hypot(x, ye)
    out.set([cb * Math.cos(lon), cb * Math.sin(lon), ze], i * 3)
  })
  return out
}

/** Approximate star colour from B−V (blue-white to orange), for display. */
export function starColor(bv: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (bv + 0.3) / 1.9))
  return [0.75 + 0.25 * t, 0.82 + 0.1 * (1 - Math.abs(t - 0.4)), 1 - 0.45 * t]
}
