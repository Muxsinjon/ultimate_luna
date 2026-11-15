import { describe, expect, it } from 'vitest'
import {
  R_MOON_KM,
  SUN_RADIUS_DEG,
  angularRadiusDeg,
  curvatureDropKm,
  discFractionAbove,
  terrainElevationDeg,
  upperLimbMargin,
} from './disc'
import { normalizeLon360, parseLat, parseLon, toLon180 } from './lon'
import { firstCrossing, intersect, longestGap, percentCovered, positiveIntervals } from './windows'

const H = 3_600_000

describe('longitude normalization', () => {
  it.each([
    [0, 0],
    [360, 0],
    [-150.05233, 209.94767],
    [-180, 180],
    [720.5, 0.5],
    [-0.0, 0],
    [29.1958, 29.1958],
  ])('normalizeLon360(%f) = %f', (a, b) => {
    expect(normalizeLon360(a)).toBeCloseTo(b, 9)
  })
  it('round-trips to −180..180 for display', () => {
    expect(toLon180(209.94767)).toBeCloseTo(-150.05233, 9)
    expect(toLon180(180)).toBe(180)
    expect(toLon180(359.9)).toBeCloseTo(-0.1, 9)
  })
  it('parses user input with hemispheres', () => {
    expect(parseLon('150.05 W')).toBeCloseTo(209.95, 9)
    expect(parseLon('29.2°E')).toBeCloseTo(29.2, 9)
    expect(parseLon('-23.42')).toBeCloseTo(336.58, 9)
    expect(parseLon('abc')).toBeNull()
    expect(parseLat('84.79S')).toBeCloseTo(-84.79, 9)
    expect(parseLat('91')).toBeNull()
  })
  it('rejects non-finite values', () => {
    expect(() => normalizeLon360(Number.NaN)).toThrow()
  })
})

describe('curvature drop', () => {
  it('is d²/2R', () => {
    expect(curvatureDropKm(50)).toBeCloseTo((50 * 50) / (2 * 1737.4), 9) // 0.7195 km
    expect(curvatureDropKm(100)).toBeCloseTo(2.878, 3)
    expect(curvatureDropKm(0)).toBe(0)
  })
  it('matches the exact spherical geometry used for horizon masks (first order)', () => {
    for (const d of [5, 20, 50, 100]) {
      const exact = terrainElevationDeg(d, 0, 0, R_MOON_KM)
      const approx = (Math.atan(-curvatureDropKm(d) / d) * 180) / Math.PI
      expect(Math.abs(exact - approx)).toBeLessThan(0.002)
    }
  })
  it('a 5 km peak 120 km away is barely above the horizon (Malapert seen from the pole)', () => {
    const el = terrainElevationDeg(120, 5, 0)
    expect(el).toBeGreaterThan(0.3)
    expect(el).toBeLessThan(0.5)
  })
})

describe('partial disc visibility', () => {
  it('limits and symmetry', () => {
    expect(discFractionAbove(1, SUN_RADIUS_DEG)).toBe(1)
    expect(discFractionAbove(-1, SUN_RADIUS_DEG)).toBe(0)
    expect(discFractionAbove(0, SUN_RADIUS_DEG)).toBeCloseTo(0.5, 12)
    for (const m of [0.05, 0.1, 0.2]) {
      expect(discFractionAbove(m, SUN_RADIUS_DEG) + discFractionAbove(-m, SUN_RADIUS_DEG)).toBeCloseTo(1, 12)
    }
  })
  it('matches the circular-segment area for a chord at half the radius', () => {
    // segment area fraction = (acos(0.5) − 0.5·√0.75)/π = 0.19550
    expect(discFractionAbove(-0.5, 1)).toBeCloseTo(0.1955, 4)
    expect(discFractionAbove(0.5, 1)).toBeCloseTo(0.8045, 4)
  })
  it('upper-limb margin defines rise/set', () => {
    expect(upperLimbMargin(-SUN_RADIUS_DEG, SUN_RADIUS_DEG)).toBe(0)
    expect(discFractionAbove(-SUN_RADIUS_DEG + 1e-9, SUN_RADIUS_DEG)).toBeGreaterThan(0)
  })
  it("Earth's apparent radius is about 0.95° at mean distance", () => {
    expect(angularRadiusDeg(6371, 384400)).toBeCloseTo(0.9496, 3)
    expect(() => angularRadiusDeg(6371, 6000)).toThrow()
  })
  it('rejects a non-positive radius', () => {
    expect(() => discFractionAbove(0, 0)).toThrow()
  })
})

describe('time windows', () => {
  // Sun upper-limb clearance falling linearly 0.5°/h from +2° at t=0 → crosses zero at t=4 h
  const falling = Array.from({ length: 10 }, (_, i) => ({ t: i * H, v: 2 - 0.5 * i }))

  it('time-to-sunset by interpolated zero crossing', () => {
    const c = firstCrossing(falling)
    expect(c).not.toBeNull()
    expect(c!.rising).toBe(false)
    expect(c!.time).toBeCloseTo(4 * H, 6)
  })
  it('time-to-Earthset with an off-grid crossing (between samples)', () => {
    const s = [
      { t: 0, v: 0.9 },
      { t: H, v: 0.3 },
      { t: 2 * H, v: -0.3 },
    ]
    expect(firstCrossing(s)!.time).toBeCloseTo(1.5 * H, 6)
    expect(
      firstCrossing([
        { t: 0, v: 1 },
        { t: H, v: 2 },
      ]),
    ).toBeNull()
  })
  it('% sunlit over N days', () => {
    // 3 days; sun visible during day 1 only (24 h of 72 h) → 33.3 %
    const sun = [{ start: 0, end: 24 * H }]
    expect(percentCovered(sun, 0, 72 * H)).toBeCloseTo(33.333, 2)
    expect(percentCovered([{ start: -10 * H, end: 6 * H }], 0, 24 * H)).toBeCloseTo(25, 6) // clipped
    expect(percentCovered([], 0, 1)).toBe(0)
  })
  it('longest dark period', () => {
    const sun = [
      { start: 2 * H, end: 10 * H },
      { start: 15 * H, end: 20 * H },
    ]
    // gaps: 0–2 (2 h), 10–15 (5 h), 20–30 (10 h)
    expect(longestGap(sun, 0, 30 * H)).toBe(10 * H)
    expect(longestGap([], 0, 7 * H)).toBe(7 * H)
  })
  it('intervals and intersection', () => {
    const iv = positiveIntervals([
      { t: 0, v: -1 },
      { t: H, v: 1 },
      { t: 2 * H, v: 1 },
      { t: 3 * H, v: -1 },
    ])
    expect(iv).toHaveLength(1)
    expect(iv[0].start).toBeCloseTo(0.5 * H, 6)
    expect(iv[0].end).toBeCloseTo(2.5 * H, 6)
    expect(intersect([{ start: 0, end: 10 }], [{ start: 5, end: 20 }])).toEqual([{ start: 5, end: 10 }])
  })
})
