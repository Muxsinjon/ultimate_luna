// One shared mission state for every workspace, mirrored in the URL (pure helpers, unit-tested).
import { DEFAULT_REQ, DEFAULT_WEIGHTS, type Requirements, type Weights } from './finder'
import type { TimeZoneMode } from './format'
import type { Mode } from './prefs'
import type { VisModel } from './visibility'

export type Workspace = 'home' | 'compare' | 'finder' | 'surface' | 'terrain' | 'about'
export const WORKSPACES: Workspace[] = ['home', 'compare', 'finder', 'surface', 'terrain', 'about']
export const DURATIONS = [1, 3, 7, 14, 30] as const

export interface MissionState {
  siteA: string
  siteB: string
  /** which of the two sites Surface View shows */
  surfaceSite: 'A' | 'B'
  /** Surface View in 3D first-person mode on 5 m terrain (Milestone 7) */
  surface3d: boolean
  /** show every expert control (false = simple view for first-time users) */
  full: boolean
  missionStart: number
  durationDays: number
  selectedTime: number
  searchStart: number
  searchEnd: number
  req: Requirements
  /** Mission Window Finder soft preferences (Milestone 6) */
  weights: Weights
  ws: Workspace
  mode: Mode
  tz: TimeZoneMode
  vis: VisModel
}

const H = 3_600_000
/**
 * Guided-demo scenario backed by real data: on 2026-11-22 the Sun sets at Nobile Rim 2 while still about
 * 6.4° above the smooth horizon, hidden by a ridge; Connecting Ridge stays sunlit for the whole 14 days.
 */
export const DEFAULT_STATE: MissionState = {
  siteA: 'nobile-rim-2',
  siteB: 'connecting-ridge',
  surfaceSite: 'A',
  surface3d: false,
  full: false,
  missionStart: Date.parse('2026-11-14T00:00:00Z'),
  durationDays: 14,
  selectedTime: Date.parse('2026-11-22T01:00:00Z'),
  searchStart: Date.parse('2026-11-14T00:00:00Z'),
  searchEnd: Date.parse('2027-02-14T00:00:00Z'),
  req: DEFAULT_REQ,
  weights: DEFAULT_WEIGHTS,
  ws: 'home',
  mode: 'planner',
  tz: 'utc',
  vis: 'terrain',
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16) + 'Z'
const time = (v: string | null) => {
  if (!v) return undefined
  const ms = Date.parse(v)
  return Number.isFinite(ms) ? ms : undefined
}
const num = (v: string | null, lo: number, hi: number) => {
  if (v === null || v === '') return undefined
  const x = Number(v)
  return Number.isFinite(x) && x >= lo && x <= hi ? x : undefined
}

export function toHash(s: MissionState): string {
  const p = new URLSearchParams({
    ws: s.ws,
    a: s.siteA,
    b: s.siteB,
    sv: s.surfaceSite,
    fp: s.surface3d ? '1' : '',
    ui: s.full ? 'full' : 'simple',
    t: iso(s.missionStart),
    d: String(s.durationDays),
    at: iso(s.selectedTime),
    ss: iso(s.searchStart),
    se: iso(s.searchEnd),
    rs: String(s.req.minSunPct),
    re: String(s.req.minEarthPct),
    rj: s.req.minJointPct === null ? '' : String(s.req.minJointPct),
    rd: String(s.req.maxDarkH),
    rb: String(s.req.maxBlackoutH),
    tr: s.req.terrain
      ? [s.req.terrain.maxSlopeDeg, s.req.terrain.maxRoughM, s.req.terrain.radiusM, s.req.terrain.minMeetsPct].join(',')
      : '',
    w: [s.weights.sun, s.weights.earth, s.weights.joint, s.weights.dark, s.weights.blackout, s.weights.terrain].join(','),
    mode: s.mode,
    tz: s.tz,
    vis: s.vis,
  })
  return `#${p.toString()}`
}

/** "slope,rough,radius,minPct" (all finite, in range) or '' for no terrain requirement. */
function parseTerrain(v: string | null, base: Requirements['terrain']): Requirements['terrain'] {
  if (v === null) return base ?? null
  if (v === '') return null
  const x = v.split(',').map(Number)
  const ok =
    x.length === 4 &&
    x.every(Number.isFinite) &&
    x[0] >= 0 &&
    x[0] <= 90 &&
    x[1] >= 0 &&
    x[1] <= 100 &&
    x[2] >= 5 &&
    x[2] <= 2000 &&
    x[3] >= 0 &&
    x[3] <= 100
  return ok ? { maxSlopeDeg: x[0], maxRoughM: x[1], radiusM: x[2], minMeetsPct: x[3] } : (base ?? null)
}

/** Six non-negative weights (sun, earth, joint, dark, blackout, terrain), each at most 10. */
function parseWeights(v: string | null, base: Weights): Weights {
  if (!v) return base
  const x = v.split(',').map(Number)
  if (x.length !== 6 || !x.every((n) => Number.isFinite(n) && n >= 0 && n <= 10)) return base
  return { sun: x[0], earth: x[1], joint: x[2], dark: x[3], blackout: x[4], terrain: x[5] }
}

/** Parse a hash into a full state, falling back to `base` for anything missing or invalid. */
export function fromHash(hash: string, base: MissionState = DEFAULT_STATE): MissionState {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const ws = p.get('ws') as Workspace | null
  const d = num(p.get('d'), 1, 90)
  const rj = p.get('rj')
  return {
    siteA: p.get('a') || base.siteA,
    siteB: p.get('b') || base.siteB,
    surfaceSite: p.get('sv') === 'B' ? 'B' : p.get('sv') === 'A' ? 'A' : base.surfaceSite,
    surface3d: p.get('fp') === '1' ? true : p.get('fp') === '' ? false : base.surface3d,
    full: p.get('ui') === 'full' ? true : p.get('ui') === 'simple' ? false : base.full,
    missionStart: time(p.get('t')) ?? base.missionStart,
    durationDays: d ?? base.durationDays,
    selectedTime: time(p.get('at')) ?? base.selectedTime,
    searchStart: time(p.get('ss')) ?? base.searchStart,
    searchEnd: time(p.get('se')) ?? base.searchEnd,
    req: {
      minSunPct: num(p.get('rs'), 0, 100) ?? base.req.minSunPct,
      minEarthPct: num(p.get('re'), 0, 100) ?? base.req.minEarthPct,
      minJointPct: rj === '' ? null : (num(rj, 0, 100) ?? base.req.minJointPct),
      maxDarkH: num(p.get('rd'), 0, 2000) ?? base.req.maxDarkH,
      maxBlackoutH: num(p.get('rb'), 0, 2000) ?? base.req.maxBlackoutH,
      terrain: parseTerrain(p.get('tr'), base.req.terrain ?? null),
    },
    weights: parseWeights(p.get('w'), base.weights),
    ws: ws && WORKSPACES.includes(ws) ? ws : base.ws,
    mode: p.get('mode') === 'explore' ? 'explore' : p.get('mode') === 'planner' ? 'planner' : base.mode,
    tz: p.get('tz') === 'local' ? 'local' : p.get('tz') === 'utc' ? 'utc' : base.tz,
    vis: p.get('vis') === 'geometric' ? 'geometric' : p.get('vis') === 'terrain' ? 'terrain' : base.vis,
  }
}

/** Keep the cursor and mission inside the supported data; returns a note when something was adjusted. */
export function clampToCoverage(s: MissionState, dataStart: number, dataEnd: number): { state: MissionState; note: string | null } {
  let note: string | null = null
  let start = s.missionStart
  const dur = s.durationDays * 24 * H
  if (start < dataStart) {
    start = dataStart
    note = 'The mission start was before the supported data (2023-01-01) and has been moved to the first supported date.'
  }
  if (start + dur > dataEnd) {
    start = Math.max(dataStart, dataEnd - dur)
    note = 'The mission would run past the supported data (end of 2031) and has been moved earlier to fit.'
  }
  const end = start + dur
  const selectedTime = Math.max(start, Math.min(end - H, s.selectedTime))
  return { state: { ...s, missionStart: start, selectedTime }, note }
}
