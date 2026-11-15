import { describe, expect, it } from 'vitest'
import { summarizeSamples, type Sample } from './analysis'
import { compareRows } from '../components/CompareTable'

const s = (t: number, sunEl: number, sunFrac: number): Sample =>
  ({
    t,
    sunAz: 0,
    sunEl,
    sunHorizon: 0,
    sunMargin: sunEl,
    sunUpper: sunFrac > 0 ? 1 : -1,
    sunFrac,
    earthAz: 0,
    earthEl: -5,
    earthHorizon: 0,
    earthMargin: -5,
    earthUpper: -4,
    earthFrac: 0,
    earthRadiusDeg: 0.95,
    earthDistKm: 384_000,
  }) as Sample

describe('sunlight definitions (Milestone 5)', () => {
  const xs = [s(0, 2, 1), s(1, 0.1, 0.5), s(2, -1, 0), s(3, 3, 1)]
  it('separates full disc, partial disc and disc-weighted sunlight in the terrain model', () => {
    const m = summarizeSamples(xs, 3_600_000, 'terrain')
    expect(m.sunPct).toBe(75) // any part of the disc
    expect(m.sunFullPct).toBe(50)
    expect(m.sunPartialPct).toBe(25)
    expect(m.sunDiscWeightedPct).toBeCloseTo(62.5, 9) // partial sunlight is never counted as full
  })
  it('does not invent partial-disc values in the geometric model', () => {
    const g = summarizeSamples(xs, 3_600_000, 'geometric')
    expect([g.sunFullPct, g.sunPartialPct, g.sunDiscWeightedPct]).toEqual([null, null, null])
    expect(compareRows(g, g).some((r) => r.label.startsWith('Full Sun disc'))).toBe(false)
    const t = summarizeSamples(xs, 3_600_000, 'terrain')
    expect(compareRows(t, t).map((r) => r.label)).toContain('Only part of the Sun visible')
  })
})
