// "What blocks the Sun (and Earth)": attribute hours lost to terrain to the part of the horizon that caused them.
// Pure functions over hourly samples (half-open: each sample covers 1 h). A lost hour = the body's upper limb is above
// the flat 0° horizon but at or below the site's terrain horizon (the terrain rule of the planner).
import type { Sample } from './analysis'
import type { Site } from './data'
import { SUN_RADIUS_DEG } from './physics/disc'

export type Body = 'sun' | 'earth'
export interface Blocker {
  azFrom: number
  azTo: number
  /** azimuth (deg, clockwise from north) of the highest terrain in this direction */
  peakAz: number
  /** terrain elevation angle there (deg) */
  peakElDeg: number
  /** distance to that terrain (km), when known */
  distKm: number | null
  hours: number
  /** share of all hours lost to terrain (%) */
  sharePct: number
}
export interface TerrainLoss {
  body: Body
  /** hours the body is above a flat horizon but hidden by terrain */
  lostHours: number
  /** hours the body is visible over the terrain */
  visibleHours: number
  blockers: Blocker[]
}

export function terrainLosses(samples: Sample[], site: Site, azStepDeg: number, body: Body, binDeg = 15): TerrainLoss {
  const nb = Math.round(360 / binDeg)
  const hours = new Array<number>(nb).fill(0)
  let lost = 0,
    visible = 0
  for (const s of samples) {
    const el = body === 'sun' ? s.sunEl : s.earthEl
    const r = body === 'sun' ? SUN_RADIUS_DEG : s.earthRadiusDeg
    const upper = body === 'sun' ? s.sunUpper : s.earthUpper
    const az = body === 'sun' ? s.sunAz : s.earthAz
    if (upper > 0) visible++
    else if (el + r > 0) {
      lost++
      hours[Math.floor((((az % 360) + 360) % 360) / binDeg) % nb]++
    }
  }
  const per = Math.round(binDeg / azStepDeg)
  const blockers: Blocker[] = []
  hours.forEach((h, b) => {
    if (!h) return
    let best = b * per
    for (let i = b * per; i < (b + 1) * per && i < site.horizon.length; i++) if (site.horizon[i] > site.horizon[best]) best = i
    blockers.push({
      azFrom: b * binDeg,
      azTo: (b + 1) * binDeg,
      peakAz: best * azStepDeg,
      peakElDeg: site.horizon[best],
      distKm: site.horizonDistKm?.[best] ?? null,
      hours: h,
      sharePct: (100 * h) / lost,
    })
  })
  blockers.sort((a, b) => b.hours - a.hours || a.azFrom - b.azFrom)
  return { body, lostHours: lost, visibleHours: visible, blockers }
}

const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
export const compassWord = (az: number) => COMPASS[Math.round((((az % 360) + 360) % 360) / 45) % 8]

/** One plain sentence built only from the computed numbers. */
export function blockerSentence(l: TerrainLoss): string {
  const what = l.body === 'sun' ? 'the Sun' : 'Earth'
  if (l.lostHours === 0) return `No terrain hides ${what} during this mission: whenever it is above a flat horizon, it is in view.`
  const top = l.blockers[0]
  const where =
    top.distKm === null
      ? `terrain to the ${compassWord(top.peakAz)}`
      : `${top.distKm < 1 ? 'a slope' : 'a ridge'} ${top.distKm < 10 ? top.distKm.toFixed(1) : Math.round(top.distKm)} km to the ${compassWord(top.peakAz)}`
  const cost = l.body === 'sun' ? 'sunlight' : 'direct Earth link'
  return `Terrain costs ${l.lostHours} h of ${cost} in this mission. Mostly ${where} (azimuth ${top.azFrom}–${top.azTo}°, rising ${top.peakElDeg.toFixed(1)}° above flat), which causes ${Math.round(top.sharePct)} % of those hours.`
}
