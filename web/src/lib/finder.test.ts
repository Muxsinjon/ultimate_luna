import { describe, expect, it } from 'vitest'
import { type Requirements, checkSentence, checksFor, metricsAt, prepare, rank, search, statusFor } from './finder'

const H = 3_600_000
const flags = (pattern: string) => Uint8Array.from(pattern.split('').map((c) => (c === '1' ? 1 : 0)))
const req = (r: Partial<Requirements> = {}): Requirements => ({
  minSunPct: 50,
  minEarthPct: 50,
  minJointPct: null,
  maxDarkH: 4,
  maxBlackoutH: 4,
  ...r,
})

describe('finder metrics', () => {
  // 12 hours: sun 111100001111, earth 110011110000
  const p = prepare({ siteId: 's', sun: flags('111100001111'), earth: flags('110011110000') })
  it('computes percentages, longest runs and interruptions', () => {
    const m = metricsAt(p, 0, 12)
    expect(m.sunPct).toBeCloseTo((100 * 8) / 12, 9)
    expect(m.earthPct).toBeCloseTo(50, 9)
    expect(m.jointPct).toBeCloseTo((100 * 2) / 12, 9) // only hours 0 and 1 have both
    expect(m.longestDarkH).toBe(4)
    expect(m.darkSpan).toEqual({ startIndex: 4, hours: 4 })
    expect(m.longestBlackoutH).toBe(4) // hours 8-11 (to the window end)
    expect(m.linkInterruptions).toBe(2) // hours 2-3 and 8-11
    expect(m.longestJointH).toBe(2)
  })
  it('clips runs to the window (a mission that starts or ends in a blackout)', () => {
    const m = metricsAt(p, 6, 4) // hours 6..9: sun 0011, earth 1100
    expect(m.longestDarkH).toBe(2)
    expect(m.longestBlackoutH).toBe(2)
    expect(m.sunPct).toBe(50)
  })
  it('invariants: 0–100 %, joint ≤ each, durations ≤ mission', () => {
    for (let i = 0; i <= 8; i++) {
      const m = metricsAt(p, i, 4)
      for (const v of [m.sunPct, m.earthPct, m.jointPct]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
      expect(m.jointPct).toBeLessThanOrEqual(Math.min(m.sunPct, m.earthPct))
      expect(m.longestDarkH).toBeLessThanOrEqual(4)
      expect(m.longestBlackoutH).toBeLessThanOrEqual(4)
    }
  })
  it('always visible and never visible', () => {
    const always = prepare({ siteId: 'a', sun: flags('11111111'), earth: flags('11111111') })
    const never = prepare({ siteId: 'n', sun: flags('00000000'), earth: flags('00000000') })
    const ma = metricsAt(always, 0, 8)
    expect([ma.sunPct, ma.earthPct, ma.jointPct, ma.longestDarkH, ma.linkInterruptions]).toEqual([100, 100, 100, 0, 0])
    const mn = metricsAt(never, 0, 8)
    expect([mn.sunPct, mn.earthPct, mn.longestDarkH, mn.longestBlackoutH, mn.linkInterruptions]).toEqual([0, 0, 8, 8, 1])
  })
})

describe('finder thresholds and status', () => {
  const p = prepare({ siteId: 's', sun: flags('111100001111'), earth: flags('110011110000') })
  it('applies min and max thresholds exactly at the boundary', () => {
    const m = metricsAt(p, 0, 12) // dark 4 h, blackout 4 h
    expect(checksFor(m, req({ maxDarkH: 4 })).find((c) => c.key === 'maxDarkH')!.pass).toBe(true)
    expect(checksFor(m, req({ maxDarkH: 3 })).find((c) => c.key === 'maxDarkH')!.pass).toBe(false)
    expect(checksFor(m, req({ minEarthPct: 50 })).find((c) => c.key === 'minEarthPct')!.pass).toBe(true)
    expect(checksFor(m, req({ minEarthPct: 51 })).find((c) => c.key === 'minEarthPct')!.pass).toBe(false)
  })
  it('optional joint requirement only counts when set', () => {
    const m = metricsAt(p, 0, 12)
    expect(checksFor(m, req()).length).toBe(4)
    expect(checksFor(m, req({ minJointPct: 10 })).length).toBe(5)
  })
  it('classifies meets / partial / fails', () => {
    const m = metricsAt(p, 0, 12)
    expect(statusFor(checksFor(m, req()))).toBe('meets')
    expect(statusFor(checksFor(m, req({ maxDarkH: 1 })))).toBe('partial')
    expect(statusFor(checksFor(m, req({ maxDarkH: 1, maxBlackoutH: 1, minSunPct: 90 })))).toBe('fails')
  })
  it('explains a failed maximum with the actual numbers', () => {
    const m = metricsAt(p, 0, 12)
    const c = checksFor(m, req({ maxBlackoutH: 3 })).find((x) => x.key === 'maxBlackoutH')!
    expect(checkSentence(c)).toBe(
      'This candidate exceeds the configured maximum for longest communication blackout. The modeled uninterrupted period is 4 h, while the mission allows only 3 h.',
    )
  })
})

describe('search and ranking', () => {
  const good = prepare({ siteId: 'good', sun: flags('1111111111110000'), earth: flags('1111111111111111') })
  const bad = prepare({ siteId: 'bad', sun: flags('0000000000001111'), earth: flags('0000111100000000') })
  const run = (r: Requirements, everyH = 4, durationH = 8) =>
    search({ sites: [bad, good], t0Ms: 0, stepMs: H, searchStartMs: 0, searchEndMs: 12 * H, everyH, durationH, req: r })

  it('puts feasible candidates first, then partial, then infeasible, then insufficient data', () => {
    const res = run(req())
    const order = res.map((c) => c.status)
    const firstNonMeet = order.findIndex((s) => s !== 'meets')
    expect(order.slice(0, firstNonMeet).every((s) => s === 'meets')).toBe(true)
    expect(order.at(-1)).toBe('insufficient') // start at hour 12 + 8 h runs past the 16 h of data
    expect(res[0].siteId).toBe('good')
  })
  it('marks candidates beyond the data as insufficient, never as visible', () => {
    const res = run(req())
    const ins = res.filter((c) => c.status === 'insufficient')
    expect(ins.length).toBe(2) // both sites at hour 12
    expect(ins.every((c) => c.metrics === null)).toBe(true)
  })
  it('returns no "meets" candidate when requirements are impossible', () => {
    const res = run(req({ minSunPct: 101 })) // no window can exceed 100 % sunlight
    expect(res.some((c) => c.status === 'meets')).toBe(false)
  })
  it('never ranks an infeasible option above a feasible one, even with a better single metric', () => {
    const a = { ...run(req())[0], status: 'partial' as const, failed: 1 }
    const b = { ...run(req())[0], status: 'meets' as const, failed: 0, metrics: { ...run(req())[0].metrics!, jointPct: 1 } }
    expect(rank([a, b])[0].status).toBe('meets')
  })
})
