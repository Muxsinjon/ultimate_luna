import type { MissionState } from './state'
/** Every scientific input identifying a search; display preferences deliberately excluded. */
export function searchKey(s: MissionState, scope: 'all' | 'pair', everyH: number) {
  return JSON.stringify([s.siteA, s.siteB, s.searchStart, s.searchEnd, s.durationDays, s.vis, s.req, s.weights, scope, everyH])
}
