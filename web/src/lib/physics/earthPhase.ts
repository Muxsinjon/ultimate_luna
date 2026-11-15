// Earth's phase as seen from a lunar surface observer. Pure function, no DOM.
import type { Vec3 } from '../geometry'

/** Mean Sun distance used when only the Sun's direction is known (km; ephem.json meanSunDistanceKm ≈ 1 au). */
export const MEAN_SUN_DISTANCE_KM = 149_597_870.7

export interface EarthPhase {
  /** angle at Earth between the Sun and the observer (rad): 0 = full Earth, π = new Earth */
  phaseAngle: number
  /** illuminated fraction of Earth's disc, 0..1 (Horizons quantity 10 "Illu%" / 100) */
  illuminated: number
}

/**
 * @param earthFromSite  vector site → Earth centre (km, MOON_ME)
 * @param sunDir         unit vector Moon → Sun (MOON_ME)
 * @param earthFromMoon  vector Moon centre → Earth centre (km); the Sun position is sunDir × sunDistanceKm from the Moon
 * Uses the full triangle Sun–Earth–observer, so it includes the ~0.15° Earth–Moon parallax of the Sun that the
 * simpler "π − elongation" approximation (used before Milestone 4) ignores.
 */
export function earthPhase(earthFromSite: Vec3, sunDir: Vec3, earthFromMoon: Vec3, sunDistanceKm = MEAN_SUN_DISTANCE_KM): EarthPhase {
  const toSun: Vec3 = [
    sunDir[0] * sunDistanceKm - earthFromMoon[0],
    sunDir[1] * sunDistanceKm - earthFromMoon[1],
    sunDir[2] * sunDistanceKm - earthFromMoon[2],
  ]
  const toObs: Vec3 = [-earthFromSite[0], -earthFromSite[1], -earthFromSite[2]]
  const a = Math.hypot(...toSun),
    b = Math.hypot(...toObs)
  if (!(a > 0) || !(b > 0)) throw new RangeError('degenerate Sun or observer vector')
  const c = (toSun[0] * toObs[0] + toSun[1] * toObs[1] + toSun[2] * toObs[2]) / (a * b)
  const phaseAngle = Math.acos(Math.max(-1, Math.min(1, c)))
  return { phaseAngle, illuminated: (1 + Math.cos(phaseAngle)) / 2 }
}
