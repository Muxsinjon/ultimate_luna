import { expect, it } from 'vitest'
import { searchKey } from './searchContext'
import { DEFAULT_STATE, type MissionState } from './state'

it('invalidates old results for every scientific input, including dates, sites, model and cadence', () => {
  const key = searchKey(DEFAULT_STATE, 'pair', 6)
  const changes: Partial<MissionState>[] = [
    { searchStart: DEFAULT_STATE.searchStart + 3600000 },
    { searchEnd: DEFAULT_STATE.searchEnd + 3600000 },
    { siteA: 'im-2' },
    { siteB: 'im-2' },
    { vis: 'geometric' },
    { durationDays: 30 },
    { req: { ...DEFAULT_STATE.req, minSunPct: 20 } },
    { req: { ...DEFAULT_STATE.req, terrain: { maxSlopeDeg: 10, maxRoughM: 0.2, radiusM: 50, minMeetsPct: 90 } } },
    { weights: { ...DEFAULT_STATE.weights, earth: 3 } },
  ]
  changes.forEach((patch) => expect(searchKey({ ...DEFAULT_STATE, ...patch }, 'pair', 6)).not.toBe(key))
  expect(searchKey(DEFAULT_STATE, 'all', 6)).not.toBe(key)
  expect(searchKey(DEFAULT_STATE, 'pair', 1)).not.toBe(key)
})
it('preserves results across display changes', () => {
  expect(searchKey({ ...DEFAULT_STATE, tz: 'local', full: true, mode: 'explore', selectedTime: 0 }, 'all', 6)).toBe(
    searchKey(DEFAULT_STATE, 'all', 6),
  )
})
