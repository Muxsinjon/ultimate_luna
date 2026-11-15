// Milestone 6: hard terrain requirement, soft preference weights and an independent re-derivation of the ranking.
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REQ,
  DEFAULT_WEIGHTS,
  prepare,
  rank,
  scoreFor,
  search,
  terrainCheck,
  type Candidate,
  type Requirements,
  type TerrainScreen,
  type Weights,
} from './finder'
import { NO_TERRAIN, terrainScreenFrom, type FootprintDetail } from './terrainCompare'

const flags = (pattern: string) => Uint8Array.from(pattern.split('').map((c) => (c === '1' ? 1 : 0)))
const site = (id: string, sun: string, earth: string) => prepare({ siteId: id, sun: flags(sun), earth: flags(earth) })
const H = 3_600_000
const base = (over: Partial<Parameters<typeof search>[0]> = {}) =>
  search({
    sites: [site('a', '111100001111', '111111110000'), site('b', '110011001100', '101010101010')],
    t0Ms: 0,
    stepMs: H,
    searchStartMs: 0,
    searchEndMs: 4 * H,
    everyH: 1,
    durationH: 8,
    req: { ...DEFAULT_REQ, minSunPct: 0, minEarthPct: 0, maxDarkH: 100, maxBlackoutH: 100 },
    ...over,
  })
const known = (pct: number): TerrainScreen => ({ meetsPct: pct, reason: 'test', product: 'SiteX' })
const terrainReq = (minMeetsPct: number): Requirements => ({
  ...DEFAULT_REQ,
  minSunPct: 0,
  minEarthPct: 0,
  maxDarkH: 100,
  maxBlackoutH: 100,
  terrain: { maxSlopeDeg: 10, maxRoughM: 0.3, radiusM: 100, minMeetsPct },
})

describe('hard terrain requirement', () => {
  it('passes and fails exactly at the boundary', () => {
    const r = terrainReq(90)
    const at = terrainCheck(r.terrain!, known(90))
    const below = terrainCheck(r.terrain!, known(89.999))
    expect('pass' in at && at.pass).toBe(true)
    expect('pass' in below && below.pass).toBe(false)
  })
  it('missing terrain makes every candidate at that site insufficient data with the reason, never a pass', () => {
    const res = base({ req: terrainReq(0), terrain: { a: known(100), b: NO_TERRAIN('Site B') } })
    const b = res.filter((c) => c.siteId === 'b')
    expect(b.every((c) => c.status === 'insufficient')).toBe(true)
    expect(b[0].reason).toMatch(/never reused/)
    expect(res.filter((c) => c.siteId === 'a').every((c) => c.status === 'meets')).toBe(true)
    // insufficient candidates still sort after every evaluated one
    expect(res.findIndex((c) => c.status === 'insufficient')).toBe(res.filter((c) => c.status !== 'insufficient').length)
  })
  it('partial footprint coverage is unknown, not favourable', () => {
    const d = { valid: 900, total: 1000, meetsPct: 100, coveragePct: 90, radiusM: 100 } as FootprintDetail
    const s = terrainScreenFrom(d, 'Site04', 'Shackleton Rim')
    expect(s.meetsPct).toBeNull()
    expect(s.reason).toMatch(/900 of 1000/)
    expect(terrainScreenFrom(null, 'Site04', 'x').meetsPct).toBeNull()
    expect(terrainScreenFrom({ ...d, valid: 1000 }, 'Site04', 'x').meetsPct).toBe(100)
  })
  it('a terrain failure counts as a failed hard requirement', () => {
    const res = base({ req: terrainReq(95), terrain: { a: known(50), b: known(99) } })
    for (const c of res.filter((x) => x.siteId === 'a')) {
      expect(c.checks.find((k) => k.key === 'terrain')!.pass).toBe(false)
      expect(c.status).not.toBe('meets')
    }
  })
  it('no feasible window: nothing is marked as meeting', () => {
    const res = base({ req: { ...terrainReq(100), minSunPct: 100, minEarthPct: 100 }, terrain: { a: known(80), b: known(80) } })
    expect(res.some((c) => c.status === 'meets')).toBe(false)
  })
})

describe('soft preference score', () => {
  const m = { hours: 10, sunPct: 80, earthPct: 40, jointPct: 30, longestDarkH: 2, longestBlackoutH: 5 } as Parameters<typeof scoreFor>[0]
  it('is the weighted mean of normalized components with visible contributions', () => {
    const w: Weights = { sun: 2, earth: 1, joint: 0, dark: 1, blackout: 0, terrain: 0 }
    const r = scoreFor(m, undefined, w)
    expect(r.score).toBeCloseTo((2 * 0.8 + 1 * 0.4 + 1 * (1 - 2 / 10)) / 4, 12)
    expect(r.contributions.map((c) => c.key)).toEqual(['sun', 'earth', 'dark'])
    expect(r.contributions.reduce((s, c) => s + c.contribution, 0)).toBeCloseTo(r.score!, 12)
  })
  it('excludes an unknown terrain component instead of treating it as zero or one', () => {
    const r = scoreFor(m, { meetsPct: null, reason: 'x' }, { ...DEFAULT_WEIGHTS, joint: 1, terrain: 1 })
    expect(r.score).toBeCloseTo(0.3, 12)
    expect(r.contributions.find((c) => c.key === 'terrain')!.normalized).toBeNull()
  })
  it('no weights: no score, deterministic tie-breaks', () => {
    const r = scoreFor(m, undefined, { sun: 0, earth: 0, joint: 0, dark: 0, blackout: 0, terrain: 0 })
    expect(r.score).toBeNull()
  })
  it('default weights reproduce the pre-Milestone-6 order (status, failures, joint %, darkness, start)', () => {
    const res = base()
    const old = [...res].sort(
      (a, b) =>
        ['meets', 'partial', 'fails', 'insufficient'].indexOf(a.status) - ['meets', 'partial', 'fails', 'insufficient'].indexOf(b.status) ||
        a.failed - b.failed ||
        (b.metrics?.jointPct ?? -1) - (a.metrics?.jointPct ?? -1) ||
        (a.metrics?.longestDarkH ?? 1e9) - (b.metrics?.longestDarkH ?? 1e9) ||
        a.startMs - b.startMs ||
        a.siteId.localeCompare(b.siteId),
    )
    expect(res.map((c) => `${c.siteId}@${c.startMs}`)).toEqual(old.map((c) => `${c.siteId}@${c.startMs}`))
  })
  it('changing weights reorders only within the same status; pass/fail is unaffected', () => {
    const req: Requirements = { ...DEFAULT_REQ, minSunPct: 50, minEarthPct: 0, maxDarkH: 100, maxBlackoutH: 100 }
    const a = base({ req })
    const b = base({ req, weights: { sun: 0, earth: 5, joint: 0, dark: 0, blackout: 1, terrain: 0 } })
    const st = (r: Candidate[]) => Object.fromEntries(r.map((c) => [`${c.siteId}@${c.startMs}`, [c.status, c.failed]]))
    expect(st(b)).toEqual(st(a))
    const order = ['meets', 'partial', 'fails', 'insufficient']
    for (const r of [a, b])
      for (let i = 1; i < r.length; i++) expect(order.indexOf(r[i].status)).toBeGreaterThanOrEqual(order.indexOf(r[i - 1].status))
  })
  it('ties are broken deterministically (darkness, start, site id)', () => {
    const twin = [site('z', '1111', '1111'), site('y', '1111', '1111')]
    const res = search({ sites: twin, t0Ms: 0, stepMs: H, searchStartMs: 0, searchEndMs: 0, everyH: 1, durationH: 4, req: DEFAULT_REQ })
    expect(res.map((c) => c.siteId)).toEqual(['y', 'z'])
    expect(res[0].score).toBe(res[1].score)
  })
  it('independently re-derives the ranking from the reported components', () => {
    const w: Weights = { sun: 1, earth: 1, joint: 2, dark: 1, blackout: 1, terrain: 0 }
    const res = base({ weights: w })
    // recompute each score from the displayed metrics only, then sort by the documented rule
    const re = res.map((c) => {
      const m = c.metrics!
      const s =
        (w.sun * m.sunPct) / 100 +
        (w.earth * m.earthPct) / 100 +
        (w.joint * m.jointPct) / 100 +
        w.dark * (1 - m.longestDarkH / m.hours) +
        w.blackout * (1 - m.longestBlackoutH / m.hours)
      expect(c.score).toBeCloseTo(s / 6, 12)
      return { c, s: s / 6 }
    })
    const sorted = [...re].sort(
      (x, y) => x.c.failed - y.c.failed || y.s - x.s || x.c.metrics!.longestDarkH - y.c.metrics!.longestDarkH || x.c.startMs - y.c.startMs,
    )
    expect(rank(res).map((c) => c.siteId + c.startMs)).toEqual(sorted.map((x) => x.c.siteId + x.c.startMs))
  })
})

describe('dates and blackout', () => {
  it('out-of-range starts are insufficient with a reason; exact-fit end is evaluated', () => {
    const res = search({
      sites: [site('a', '11110000', '11111111')],
      t0Ms: 0,
      stepMs: H,
      searchStartMs: -2 * H,
      searchEndMs: 5 * H,
      everyH: 1,
      durationH: 4,
      req: DEFAULT_REQ,
    })
    const by = Object.fromEntries(res.map((c) => [c.startIndex, c]))
    expect(by[-1].status).toBe('insufficient')
    expect(by[-1].reason).toMatch(/outside the supported/)
    expect(by[4].status).not.toBe('insufficient') // [4, 8) fits exactly
    expect(by[5].status).toBe('insufficient')
  })
  it('blackout duration at the limit passes, one hour more fails', () => {
    const p = site('a', '11111111', '11000111') // 3 h blackout
    const at = search({
      sites: [p],
      t0Ms: 0,
      stepMs: H,
      searchStartMs: 0,
      searchEndMs: 0,
      everyH: 1,
      durationH: 8,
      req: { ...DEFAULT_REQ, minSunPct: 0, minEarthPct: 0, maxBlackoutH: 3 },
    })
    const over = search({
      sites: [p],
      t0Ms: 0,
      stepMs: H,
      searchStartMs: 0,
      searchEndMs: 0,
      everyH: 1,
      durationH: 8,
      req: { ...DEFAULT_REQ, minSunPct: 0, minEarthPct: 0, maxBlackoutH: 2 },
    })
    expect(at[0].checks.find((c) => c.key === 'maxBlackoutH')!.pass).toBe(true)
    expect(over[0].checks.find((c) => c.key === 'maxBlackoutH')!.pass).toBe(false)
  })
})
