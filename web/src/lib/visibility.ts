// Visibility models and sample-based window metrics. Pure functions (no React).
//
// Two models, always labelled in the UI:
//  - 'terrain'   (default): visible while the upper limb of the disc clears the LOLA terrain horizon.
//  - 'geometric' (NASA Space Apps prompt §7.3): visible while the disc CENTRE is above 0°, the smooth
//                 geometric horizon. Local terrain obstruction is not included.
//
// Durations use equally spaced samples on half-open intervals: a sample at time t covers [t, t + step)
// and counts as visible if the condition holds at t. Resolution is therefore one sample step (1 h).
import type { Interval } from './physics/windows'

export type VisModel = 'terrain' | 'geometric'
export type Body = 'sun' | 'earth'

/** Minimal sample shape needed for visibility decisions. */
export interface VisSample {
  t: number
  sunEl: number
  sunUpper: number
  earthEl: number
  earthUpper: number
}

/** > 0 means visible under the given model. */
export function signal(s: VisSample, body: Body, model: VisModel): number {
  if (model === 'geometric') return body === 'sun' ? s.sunEl : s.earthEl
  return body === 'sun' ? s.sunUpper : s.earthUpper
}

export interface Flags {
  sun: Uint8Array
  earth: Uint8Array
}

export function flagsFromSamples(samples: VisSample[], model: VisModel): Flags {
  const sun = new Uint8Array(samples.length)
  const earth = new Uint8Array(samples.length)
  samples.forEach((s, i) => {
    sun[i] = signal(s, 'sun', model) > 0 ? 1 : 0
    earth[i] = signal(s, 'earth', model) > 0 ? 1 : 0
  })
  return { sun, earth }
}

/** Half-open intervals [t_i, t_j) for maximal runs where pred(i) holds. */
export function runIntervals(n: number, t: (i: number) => number, stepMs: number, pred: (i: number) => boolean): Interval[] {
  const out: Interval[] = []
  let start = -1
  for (let i = 0; i < n; i++) {
    if (pred(i)) {
      if (start < 0) start = i
    } else if (start >= 0) {
      out.push({ start: t(start), end: t(i) })
      start = -1
    }
  }
  if (start >= 0 && n > 0) out.push({ start: t(start), end: t(n - 1) + stepMs })
  return out
}

/** Longest run (in samples) where pred holds, plus the number of runs. */
export function longestRun(n: number, pred: (i: number) => boolean): { longest: number; runs: number; startIndex: number } {
  let longest = 0
  let runs = 0
  let cur = 0
  let startIndex = -1
  let curStart = 0
  for (let i = 0; i < n; i++) {
    if (pred(i)) {
      if (cur === 0) {
        runs++
        curStart = i
      }
      cur++
      if (cur > longest) {
        longest = cur
        startIndex = curStart
      }
    } else cur = 0
  }
  return { longest, runs, startIndex }
}

export function runsSummary(f: Flags, times: number[], stepMs: number) {
  const n = f.sun.length
  const t = (i: number) => times[i]
  const pct = (k: number) => (n ? (100 * k) / n : 0)
  let sunN = 0
  let earthN = 0
  let bothN = 0
  let sunOnlyN = 0
  let earthOnlyN = 0
  for (let i = 0; i < n; i++) {
    const s = f.sun[i]
    const e = f.earth[i]
    sunN += s
    earthN += e
    bothN += s & e
    sunOnlyN += s & (1 - e)
    earthOnlyN += e & (1 - s)
  }
  const neitherN = n - sunN - earthOnlyN
  const dark = longestRun(n, (i) => !f.sun[i])
  const noLink = longestRun(n, (i) => !f.earth[i])
  return {
    totalMs: n * stepMs,
    sun: runIntervals(n, t, stepMs, (i) => f.sun[i] === 1),
    earth: runIntervals(n, t, stepMs, (i) => f.earth[i] === 1),
    both: runIntervals(n, t, stepMs, (i) => (f.sun[i] & f.earth[i]) === 1),
    sunOnly: runIntervals(n, t, stepMs, (i) => f.sun[i] === 1 && f.earth[i] === 0),
    earthOnly: runIntervals(n, t, stepMs, (i) => f.sun[i] === 0 && f.earth[i] === 1),
    neither: runIntervals(n, t, stepMs, (i) => f.sun[i] === 0 && f.earth[i] === 0),
    sunPct: pct(sunN),
    earthPct: pct(earthN),
    bothPct: pct(bothN),
    sunOnlyPct: pct(sunOnlyN),
    earthOnlyPct: pct(earthOnlyN),
    neitherPct: pct(neitherN),
    longestDarkMs: dark.longest * stepMs,
    longestNoLinkMs: noLink.longest * stepMs,
    longestSunMs: longestRun(n, (i) => f.sun[i] === 1).longest * stepMs,
    longestEarthMs: longestRun(n, (i) => f.earth[i] === 1).longest * stepMs,
    linkInterruptions: noLink.runs,
  }
}

export const MODEL_LABEL: Record<VisModel, string> = {
  terrain: 'Terrain-aware visibility: upper limb above the LRO LOLA horizon (240 m terrain)',
  geometric: 'Geometric visibility: local terrain obstruction not included',
}

export const MODEL_SHORT: Record<VisModel, string> = {
  terrain: 'Terrain-aware (LOLA)',
  geometric: 'Geometric (0°)',
}
