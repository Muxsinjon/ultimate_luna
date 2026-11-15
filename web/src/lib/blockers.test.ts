import { describe, expect, it } from 'vitest'
import { blockerSentence, compassWord, terrainLosses } from './blockers'
import type { Sample } from './analysis'
import type { Site } from './data'

// flat horizon at -1° except a 3° ridge between azimuth 120° and 135° (12 km away)
const horizon = Array.from({ length: 720 }, (_, i) => (i * 0.5 >= 120 && i * 0.5 < 135 ? (i === 250 ? 3 : 2) : -1))
const dist = Array.from({ length: 720 }, (_, i) => (i === 250 ? 12 : 3))
const site = {
  id: 's',
  name: 's',
  group: 'g',
  lat: -89,
  lon: 0,
  source: 'x',
  verify: false,
  elevationM: 0,
  horizon,
  horizonDistKm: dist,
} as Site
const sample = (az: number, el: number): Sample => {
  const h = horizon[Math.floor(az / 0.5) % 720]
  return {
    t: 0,
    sunAz: az,
    sunEl: el,
    sunHorizon: h,
    sunMargin: el - h,
    sunUpper: el - h + 0.2666,
    sunFrac: 0,
    earthAz: 0,
    earthEl: -10,
    earthHorizon: -1,
    earthMargin: -9,
    earthUpper: -8,
    earthFrac: 0,
    earthRadiusDeg: 0.95,
    earthDistKm: 384000,
  } as Sample
}

describe('terrain losses (what blocks the Sun)', () => {
  it('counts hours above a flat horizon but hidden by terrain, attributed to the blocking direction', () => {
    const s = [sample(125, 1), sample(126, 1.5), sample(200, 1), sample(130, -5), sample(10, 0.5)]
    const l = terrainLosses(s, site, 0.5, 'sun')
    expect(l.lostHours).toBe(2) // two hours behind the ridge; el −5° is below a flat horizon (not lost to terrain)
    expect(l.visibleHours).toBe(2)
    expect(l.blockers[0]).toMatchObject({ azFrom: 120, azTo: 135, peakAz: 125, peakElDeg: 3, distKm: 12, hours: 2, sharePct: 100 })
  })
  it('writes a sentence only from the numbers, and handles no loss', () => {
    const l = terrainLosses([sample(125, 1)], site, 0.5, 'sun')
    expect(blockerSentence(l)).toBe(
      'Terrain costs 1 h of sunlight in this mission. Mostly a ridge 12 km to the southeast (azimuth 120–135°, rising 3.0° above flat), which causes 100 % of those hours.',
    )
    expect(blockerSentence(terrainLosses([sample(200, 1)], site, 0.5, 'sun'))).toMatch(/^No terrain hides the Sun/)
    expect(compassWord(359)).toBe('north')
  })
  it('works without distances (custom sites on older data)', () => {
    const l = terrainLosses([sample(125, 1)], { ...site, horizonDistKm: undefined }, 0.5, 'sun')
    expect(l.blockers[0].distKm).toBeNull()
    expect(blockerSentence(l)).toMatch(/terrain to the southeast/)
  })
})
