import { describe, expect, it } from 'vitest'
import { type VisSample, flagsFromSamples, longestRun, runIntervals, runsSummary, signal } from './visibility'

const H = 3_600_000
const s = (t: number, sunEl: number, sunUpper: number, earthEl: number, earthUpper: number): VisSample => ({
  t: t * H,
  sunEl,
  sunUpper,
  earthEl,
  earthUpper,
})

describe('visibility models', () => {
  it('geometric uses the centre above 0°, terrain uses the upper limb above the terrain', () => {
    // Sun 1.4° up (geometric: visible) but 1.2° below the terrain (terrain: hidden)
    const x = s(0, 1.4, -1.2, 0.3, 1.8)
    expect(signal(x, 'sun', 'geometric') > 0).toBe(true)
    expect(signal(x, 'sun', 'terrain') > 0).toBe(false)
    expect(signal(x, 'earth', 'geometric') > 0).toBe(true)
    expect(signal(x, 'earth', 'terrain') > 0).toBe(true)
  })
})

describe('half-open sampled intervals', () => {
  it('each sample covers [t, t + 1 h)', () => {
    const iv = runIntervals(
      5,
      (i) => i * H,
      H,
      (i) => i >= 1 && i <= 2,
    )
    expect(iv).toEqual([{ start: 1 * H, end: 3 * H }])
    const tail = runIntervals(
      3,
      (i) => i * H,
      H,
      () => true,
    )
    expect(tail).toEqual([{ start: 0, end: 3 * H }])
  })
  it('longest run and number of runs', () => {
    expect(longestRun(7, (i) => [0, 1, 1, 0, 1, 1, 1][i] === 1)).toEqual({ longest: 3, runs: 2, startIndex: 4 })
  })
  it('summarizes the four combined states and their invariants', () => {
    const samples = [
      s(0, 5, 5, 5, 5), // both
      s(1, 5, 5, -1, -1), // sun only
      s(2, -1, -1, 5, 5), // earth only
      s(3, -1, -1, -1, -1), // neither
    ]
    const r = runsSummary(
      flagsFromSamples(samples, 'terrain'),
      samples.map((x) => x.t),
      H,
    )
    expect([r.bothPct, r.sunOnlyPct, r.earthOnlyPct, r.neitherPct]).toEqual([25, 25, 25, 25])
    expect(r.bothPct + r.sunOnlyPct + r.earthOnlyPct + r.neitherPct).toBe(100)
    expect(r.bothPct).toBeLessThanOrEqual(Math.min(r.sunPct, r.earthPct))
    expect(r.longestDarkMs).toBe(2 * H)
    expect(r.longestDarkMs).toBeLessThanOrEqual(r.totalMs)
    expect(r.linkInterruptions).toBe(2)
  })
})
