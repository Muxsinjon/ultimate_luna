import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE, clampToCoverage, fromHash, toHash } from './state'

describe('shared mission state in the URL', () => {
  it('round-trips the full state', () => {
    const s = {
      ...DEFAULT_STATE,
      siteA: 'im-2',
      siteB: 'custom:-88.6947,309.0939',
      surfaceSite: 'B' as const,
      surface3d: true,
      full: true,
      durationDays: 3,
      ws: 'finder' as const,
      mode: 'explore' as const,
      tz: 'local' as const,
      vis: 'geometric' as const,
      req: {
        minSunPct: 40,
        minEarthPct: 70,
        minJointPct: 25,
        maxDarkH: 12,
        maxBlackoutH: 6,
        terrain: { maxSlopeDeg: 12, maxRoughM: 0.25, radiusM: 150, minMeetsPct: 80 },
      },
      weights: { sun: 1, earth: 2, joint: 0, dark: 0.5, blackout: 3, terrain: 1 },
    }
    expect(fromHash(toHash(s))).toEqual(s)
  })
  it('keeps old links valid: missing terrain/weights fall back, invalid values are ignored (Milestone 6)', () => {
    const old = fromHash('#ws=finder&rs=40&re=70&rd=12&rb=6')
    expect(old.req.terrain).toBeNull()
    expect(old.weights).toEqual(DEFAULT_STATE.weights)
    expect(fromHash('#tr=5,0.2,1,90').req.terrain).toBeNull() // radius below 5 m
    expect(fromHash('#w=1,1,1,1,1,-1').weights).toEqual(DEFAULT_STATE.weights)
    expect(fromHash('#tr=').req.terrain).toBeNull()
  })
  it('keeps the optional joint requirement switched off', () => {
    expect(fromHash(toHash(DEFAULT_STATE)).req.minJointPct).toBeNull()
  })
  it('falls back to defaults for junk values', () => {
    const s = fromHash('#ws=nope&d=0&rs=150&vis=x&t=notadate')
    expect(s.ws).toBe(DEFAULT_STATE.ws)
    expect(s.durationDays).toBe(DEFAULT_STATE.durationDays)
    expect(s.req.minSunPct).toBe(DEFAULT_STATE.req.minSunPct)
    expect(s.vis).toBe('terrain')
    expect(s.missionStart).toBe(DEFAULT_STATE.missionStart)
  })
})

describe('supported date coverage', () => {
  const start = Date.parse('2023-01-01T00:00:00Z')
  const end = Date.parse('2031-12-31T18:00:00Z')
  it('moves a mission that starts too early and explains why', () => {
    const r = clampToCoverage({ ...DEFAULT_STATE, missionStart: Date.parse('2020-01-01T00:00:00Z') }, start, end)
    expect(r.state.missionStart).toBe(start)
    expect(r.note).toMatch(/before the supported data/)
  })
  it('moves a mission that would run past the data', () => {
    const r = clampToCoverage({ ...DEFAULT_STATE, missionStart: Date.parse('2031-12-30T00:00:00Z'), durationDays: 14 }, start, end)
    expect(r.state.missionStart + 14 * 86_400_000).toBeLessThanOrEqual(end)
    expect(r.note).toMatch(/past the supported data/)
  })
  it('keeps the selected time inside the mission', () => {
    const r = clampToCoverage({ ...DEFAULT_STATE, selectedTime: Date.parse('2030-01-01T00:00:00Z') }, start, end)
    expect(r.state.selectedTime).toBeLessThan(r.state.missionStart + r.state.durationDays * 86_400_000)
    expect(r.note).toBeNull()
  })
})
