// Pure physics helpers for discs and curvature. No DOM, no React.

/** Mean angular radius of the Sun's disc as seen from the Moon (deg). Disc ≈ 0.533°. */
export const SUN_RADIUS_DEG = 0.2666
/** Mean lunar radius used by LOLA products (km). */
export const R_MOON_KM = 1737.4
/** Mean Earth radius (km), for Earth's apparent disc. */
export const R_EARTH_KM = 6371.0

/**
 * Fraction (0..1) of a disc's AREA above a horizon line.
 * @param marginDeg  height of the disc centre above the horizon (deg, negative = below)
 * @param radiusDeg  angular radius of the disc (deg, > 0)
 * Uses the circular-segment area: f = 1 − (acos(x) − x·√(1−x²)) / π with x = margin / radius.
 */
export function discFractionAbove(marginDeg: number, radiusDeg: number): number {
  if (!(radiusDeg > 0)) throw new RangeError('radiusDeg must be > 0')
  const x = marginDeg / radiusDeg
  if (x >= 1) return 1
  if (x <= -1) return 0
  return 1 - (Math.acos(x) - x * Math.sqrt(1 - x * x)) / Math.PI
}

/**
 * Upper-limb clearance (deg): > 0 when any part of the disc is above the horizon.
 * Sunrise/sunset (and Earthrise/Earthset) are the zero crossings of this quantity.
 */
export function upperLimbMargin(marginDeg: number, radiusDeg: number): number {
  return marginDeg + radiusDeg
}

/** Apparent angular radius (deg) of a sphere of radius `bodyRadiusKm` at distance `distKm`. */
export function angularRadiusDeg(bodyRadiusKm: number, distKm: number): number {
  if (!(distKm > bodyRadiusKm)) throw new RangeError('distance must exceed body radius')
  return (Math.asin(bodyRadiusKm / distKm) * 180) / Math.PI
}

/** Curvature drop (km) of the surface at ground distance d (km) below the observer's tangent plane: d²/2R. */
export function curvatureDropKm(dKm: number, rKm = R_MOON_KM): number {
  return (dKm * dKm) / (2 * rKm)
}

/**
 * Exact elevation angle (deg) of a terrain point at arc distance dKm and height hKm (relative to the
 * reference sphere) seen from an observer at height h0Km. Spherical geometry, no refraction.
 * For small d this approaches atan((h − h0 − d²/2R) / d).
 */
export function terrainElevationDeg(dKm: number, hKm: number, h0Km = 0, rKm = R_MOON_KM): number {
  const theta = dKm / rKm // central angle
  const ro = rKm + h0Km
  const rp = rKm + hKm
  // observer at (0, ro); point at (rp sinθ, rp cosθ) in the plane of the great circle
  const dx = rp * Math.sin(theta)
  const dy = rp * Math.cos(theta) - ro
  return (Math.atan2(dy, dx) * 180) / Math.PI
}
