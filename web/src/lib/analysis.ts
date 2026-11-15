// Sun / Earth visibility analysis for a site, terrain-aware. Pure functions (no React).
import type { Ephemeris, Site } from './data'
import { type Basis, type Vec3, azEl, enuBasis, horizonAt, unitVec } from './geometry'
import { R_EARTH_KM, R_MOON_KM, SUN_RADIUS_DEG, angularRadiusDeg, discFractionAbove, upperLimbMargin } from './physics/disc'
import type { Interval } from './physics/windows'
import { type Body, type Flags, type VisModel, flagsFromSamples, runsSummary, signal } from './visibility'

export { SUN_RADIUS_DEG }
export type { Interval }
export const SOLAR_CONSTANT = 1361 // W/m² at 1 AU
export const PANEL_EFFICIENCY = 0.3
export const HOUR = 3_600_000
export const DAY = 24 * HOUR
export const LUNAR_DAY = 29.530589 * DAY // synodic month

export interface SiteCtx {
  site: Site
  basis: Basis
  pos: Vec3 // km, MOON_ME
  azStep: number
}

export function makeCtx(site: Site, azStep: number): SiteCtx {
  const r = R_MOON_KM + site.elevationM / 1000
  const u = unitVec(site.lon, site.lat)
  return { site, basis: enuBasis(site.lon, site.lat), pos: [u[0] * r, u[1] * r, u[2] * r], azStep }
}

export interface Sample {
  t: number
  sunAz: number
  sunEl: number
  sunHorizon: number
  /** Sun centre height above the terrain horizon (deg). */
  sunMargin: number
  /** Upper-limb clearance (deg); > 0 means sunlit (any part of the disc visible). */
  sunUpper: number
  /** Fraction of the solar disc area above the terrain (0..1). */
  sunFrac: number
  earthAz: number
  earthEl: number
  earthHorizon: number
  earthMargin: number
  earthUpper: number
  earthFrac: number
  earthRadiusDeg: number
  earthDistKm: number
}

function rowVec(eph: Ephemeris, i: number): [Vec3, Vec3] {
  const r = eph.rows
  const k = i * 6
  return [
    [r[k], r[k + 1], r[k + 2]],
    [r[k + 3], r[k + 4], r[k + 5]],
  ]
}

export function clampTime(eph: Ephemeris, t: number) {
  return Math.max(eph.meta.startMs, Math.min(eph.endMs, t))
}

/** Interpolated Earth (km) and Sun (unit) vectors at time t (ms, UTC). */
export function vectorsAt(eph: Ephemeris, t: number): { earth: Vec3; sun: Vec3 } {
  const f = (t - eph.meta.startMs) / eph.meta.stepMs
  const i = Math.max(0, Math.min(eph.meta.count - 2, Math.floor(f)))
  const w = Math.max(0, Math.min(1, f - i))
  const [ea, sa] = rowVec(eph, i)
  const [eb, sb] = rowVec(eph, i + 1)
  const lerp = (a: Vec3, b: Vec3): Vec3 => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w]
  const s = lerp(sa, sb)
  const n = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2])
  return { earth: lerp(ea, eb), sun: [s[0] / n, s[1] / n, s[2] / n] }
}

/** Evaluate Sun/Earth geometry at a site for given body-fixed vectors. */
export function evalVectors(ctx: SiteCtx, t: number, earth: Vec3, sun: Vec3): Sample {
  const s = azEl(sun, ctx.basis)
  const ev: Vec3 = [earth[0] - ctx.pos[0], earth[1] - ctx.pos[1], earth[2] - ctx.pos[2]]
  const e = azEl(ev, ctx.basis)
  const dist = Math.sqrt(ev[0] * ev[0] + ev[1] * ev[1] + ev[2] * ev[2])
  const eR = angularRadiusDeg(R_EARTH_KM, dist)
  const sh = horizonAt(ctx.site.horizon, ctx.azStep, s.az)
  const eh = horizonAt(ctx.site.horizon, ctx.azStep, e.az)
  const sunMargin = s.el - sh
  const earthMargin = e.el - eh
  return {
    t,
    sunAz: s.az,
    sunEl: s.el,
    sunHorizon: sh,
    sunMargin,
    sunUpper: upperLimbMargin(sunMargin, SUN_RADIUS_DEG),
    sunFrac: discFractionAbove(sunMargin, SUN_RADIUS_DEG),
    earthAz: e.az,
    earthEl: e.el,
    earthHorizon: eh,
    earthMargin,
    earthUpper: upperLimbMargin(earthMargin, eR),
    earthFrac: discFractionAbove(earthMargin, eR),
    earthRadiusDeg: eR,
    earthDistKm: dist,
  }
}

export function sampleAt(ctx: SiteCtx, eph: Ephemeris, t: number): Sample {
  const { earth, sun } = vectorsAt(eph, t)
  return evalVectors(ctx, t, earth, sun)
}

/** Samples on the ephemeris' native hourly grid between t0 and t1 (inclusive). */
export function series(ctx: SiteCtx, eph: Ephemeris, t0: number, t1: number, stride = 1): Sample[] {
  const m = eph.meta
  const i0 = Math.max(0, Math.ceil((t0 - m.startMs) / m.stepMs))
  const i1 = Math.min(m.count - 1, Math.floor((t1 - m.startMs) / m.stepMs))
  const out: Sample[] = []
  for (let i = i0; i <= i1; i += stride) {
    const [e, s] = rowVec(eph, i)
    out.push(evalVectors(ctx, m.startMs + i * m.stepMs, e, s))
  }
  return out
}

export type { Body, VisModel }

export interface NextEvent {
  kind: 'Sunrise' | 'Sunset' | 'Earthrise' | 'Earthset'
  /** first hourly sample in the new state (the event happened in the hour before), or null if none before the data ends */
  time: number | null
  /** last hourly sample still in the old state */
  after: number | null
}

/** Next rise/set after t on the hourly sample grid (resolution: 1 h). */
export function nextEvent(ctx: SiteCtx, eph: Ephemeris, t: number, body: Body, model: VisModel = 'terrain', maxDays = 400): NextEvent {
  const m = eph.meta
  let i = Math.max(0, Math.floor((t - m.startMs) / m.stepMs))
  if (i > m.count - 1) {
    // outside the supported data: no event can be determined (never extrapolate)
    return { kind: body === 'sun' ? 'Sunset' : 'Earthset', time: null, after: null }
  }
  const [e0, s0] = rowVec(eph, i)
  const up = signal(evalVectors(ctx, 0, e0, s0), body, model) > 0
  const kind: NextEvent['kind'] = body === 'sun' ? (up ? 'Sunset' : 'Sunrise') : up ? 'Earthset' : 'Earthrise'
  const last = Math.min(m.count - 1, i + Math.round((maxDays * DAY) / m.stepMs))
  for (i = i + 1; i <= last; i++) {
    const [e, s] = rowVec(eph, i)
    if (signal(evalVectors(ctx, 0, e, s), body, model) > 0 !== up) {
      const time = m.startMs + i * m.stepMs
      return { kind, time, after: time - m.stepMs }
    }
  }
  return { kind, time: null, after: null }
}

/** Power per m² of panel, 30 % cells, using the visible fraction of the solar disc. */
export function panelPower(
  s: Sample,
  orientation: 'vertical' | 'horizontal' = 'vertical',
  eff = PANEL_EFFICIENCY,
  model: VisModel = 'terrain',
) {
  const el = (Math.max(0, s.sunEl) * Math.PI) / 180
  const cosInc = orientation === 'vertical' ? Math.cos(el) : Math.sin(el)
  const frac = model === 'terrain' ? s.sunFrac : s.sunEl > 0 ? 1 : 0
  return SOLAR_CONSTANT * eff * frac * Math.max(0, cosInc)
}

export interface WindowSummary {
  model: VisModel
  stepMs: number
  totalMs: number
  sun: Interval[]
  earth: Interval[]
  both: Interval[]
  sunOnly: Interval[]
  earthOnly: Interval[]
  neither: Interval[]
  sunPct: number
  earthPct: number
  bothPct: number
  sunOnlyPct: number
  earthOnlyPct: number
  neitherPct: number
  longestDarkMs: number
  longestNoLinkMs: number
  longestSunMs: number
  longestEarthMs: number
  /** number of separate periods without Earth in view inside the window */
  linkInterruptions: number
  maxSunEl: number
  avgPowerVertical: number
  /**
   * Milestone 5 sunlight definitions (terrain model only; null in the geometric model, which does not resolve
   * partial discs): share of samples with the FULL disc above the terrain horizon, with only PART of it, and the
   * mean visible disc fraction (disc-weighted sunlight, never counting partial sunlight as full).
   */
  sunFullPct: number | null
  sunPartialPct: number | null
  sunDiscWeightedPct: number | null
}

/** Samples whose start lies in [t0, t1): each covers [t, t + 1 h) (half-open). */
export function summarize(
  ctx: SiteCtx,
  eph: Ephemeris,
  t0: number,
  t1: number,
  model: VisModel = 'terrain',
): { samples: Sample[]; sum: WindowSummary } {
  const samples = series(ctx, eph, t0, t1 - 1)
  return { samples, sum: summarizeSamples(samples, eph.meta.stepMs, model) }
}

/** Pure summary of an hourly sample series (half-open intervals, sample-count durations). */
export function summarizeSamples(samples: Sample[], stepMs: number, model: VisModel = 'terrain'): WindowSummary {
  const f: Flags = flagsFromSamples(samples, model)
  const t = samples.map((s) => s.t)
  const r = runsSummary(f, t, stepMs)
  let p = 0
  let maxSunEl = -90
  let full = 0,
    partial = 0,
    frac = 0
  for (const s of samples) {
    p += panelPower(s, 'vertical', PANEL_EFFICIENCY, model)
    maxSunEl = Math.max(maxSunEl, s.sunEl)
    if (s.sunFrac >= 1) full++
    else if (s.sunFrac > 0) partial++
    frac += s.sunFrac
  }
  const n = samples.length
  const terrain = model === 'terrain' && n > 0
  return {
    model,
    stepMs,
    ...r,
    maxSunEl,
    avgPowerVertical: n ? p / n : 0,
    sunFullPct: terrain ? (100 * full) / n : null,
    sunPartialPct: terrain ? (100 * partial) / n : null,
    sunDiscWeightedPct: terrain ? (100 * frac) / n : null,
  }
}

/** Full-range hourly visibility flags for one site and model (cached). */
export interface Hourly {
  sun: Uint8Array
  earth: Uint8Array
}

const hourlyCache = new Map<string, Hourly>()

export function hourly(ctx: SiteCtx, eph: Ephemeris, model: VisModel = 'terrain'): Hourly {
  const key = `${ctx.site.id}:${ctx.site.lat}:${ctx.site.lon}:${model}`
  const hit = hourlyCache.get(key)
  if (hit) return hit
  const n = eph.meta.count
  const sun = new Uint8Array(n)
  const earth = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const [e, s] = rowVec(eph, i)
    const x = evalVectors(ctx, 0, e, s)
    sun[i] = signal(x, 'sun', model) > 0 ? 1 : 0
    earth[i] = signal(x, 'earth', model) > 0 ? 1 : 0
  }
  const h = { sun, earth }
  hourlyCache.set(key, h)
  return h
}

/**
 * Milestone 4: Sun direction (unit) and site → Earth vector (km), both MOON_ME, for a surface point at height
 * `elevationM` above the 1737.4 km sphere. Used for 3D rays; the charts use the same vectors via evalVectors.
 */
export function bodyVectorsFromSite(eph: Ephemeris, t: number, lat: number, lon: number, elevationM: number): { sun: Vec3; earth: Vec3 } {
  const { earth, sun } = vectorsAt(eph, t)
  const u = unitVec(lon, lat)
  const r = R_MOON_KM + elevationM / 1000
  return { sun, earth: [earth[0] - u[0] * r, earth[1] - u[1] * r, earth[2] - u[2] * r] }
}
