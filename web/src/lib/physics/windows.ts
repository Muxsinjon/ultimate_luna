// Pure time-window logic on sampled signals. A "signal" is any function value per time sample;
// the condition is "signal > 0" (e.g. upper-limb clearance above the terrain horizon).

export interface Interval {
  start: number
  end: number
}

export interface TimedValue {
  t: number
  v: number
}

/** Linear-interpolated zero crossing time between two samples with opposite signs. */
export function crossingTime(a: TimedValue, b: TimedValue): number {
  if (a.v === b.v) return a.t
  return a.t + ((b.t - a.t) * a.v) / (a.v - b.v)
}

/** Intervals where v > 0, with interpolated edges. Input must be time-ordered. */
export function positiveIntervals(series: TimedValue[]): Interval[] {
  const out: Interval[] = []
  let start: number | null = null
  for (let i = 0; i < series.length; i++) {
    const cur = series[i]
    if (cur.v > 0 && start === null) start = i === 0 ? cur.t : crossingTime(series[i - 1], cur)
    else if (cur.v <= 0 && start !== null) {
      out.push({ start, end: crossingTime(series[i - 1], cur) })
      start = null
    }
  }
  if (start !== null && series.length) out.push({ start, end: series[series.length - 1].t })
  return out
}

/** First sign change strictly after series[0]. Returns null if none. */
export function firstCrossing(series: TimedValue[]): { time: number; rising: boolean } | null {
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1]
    const b = series[i]
    if (a.v > 0 !== b.v > 0) return { time: crossingTime(a, b), rising: b.v > 0 }
  }
  return null
}

export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i].start, b[j].start)
    const e = Math.min(a[i].end, b[j].end)
    if (e > s) out.push({ start: s, end: e })
    if (a[i].end < b[j].end) i++
    else j++
  }
  return out
}

/** Percentage (0..100) of [t0, t1] covered by the intervals (clipped to the range). */
export function percentCovered(iv: Interval[], t0: number, t1: number): number {
  if (!(t1 > t0)) return 0
  let sum = 0
  for (const x of iv) sum += Math.max(0, Math.min(t1, x.end) - Math.max(t0, x.start))
  return (100 * sum) / (t1 - t0)
}

/** Longest gap (same units as t) inside [t0, t1] not covered by the intervals. */
export function longestGap(iv: Interval[], t0: number, t1: number): number {
  let best = 0
  let cur = t0
  for (const x of iv) {
    const s = Math.max(t0, x.start)
    if (s > cur) best = Math.max(best, s - cur)
    cur = Math.max(cur, Math.min(t1, x.end))
  }
  return Math.max(best, t1 - cur)
}
