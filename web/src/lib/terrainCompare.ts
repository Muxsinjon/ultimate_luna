// Milestone 3: equal-footprint terrain comparison between two processed LOLA sites. Pure functions.
// Uses the same sample-centre disk rule, thresholds and native 5 m layers as the Milestone 2 footprint().
import { classify, criteriaValid, footprint, valuesAtIndex, type Criteria, type HazardData } from './hazardAnalysis'
import { polarXY } from './terrain'
import type { TerrainAsset } from './terrainMesh'
import type { TerrainScreen } from './finder'

export const SLOPE_BINS = [0, 5, 10, 15, 20, 30, 90] as const

export interface Summary5 {
  min: number
  p50: number
  p90: number
  mean: number
  max: number
}

export interface FootprintDetail {
  centre: { lat: number; lon: number }
  radiusM: number
  /** radius in map-plane metres after the local stereographic/elevation scale correction */
  projectedRadiusM: number
  total: number
  valid: number
  coveragePct: number
  meets: number
  meetsPct: number | null
  exceedSlope: number
  exceedRoughness: number
  slope: Summary5 | null
  roughness: Summary5 | null
  /** counts of valid native samples per SLOPE_BINS interval [lo, hi) (last bin closed) */
  slopeHistogram: number[]
  /** from the 20 m display grid (every 4th native sample) inside the same disk */
  elevation: { min: number; max: number; samples: number } | null
  /** median PGDA total height RMS of the 20 m grid samples inside the disk */
  uncertaintyMedianM: number | null
  /** valid native samples x 25 m^2 (map-plane pixel area) */
  sampleAreaM2: number
  nominalAreaM2: number
}

function summarise(values: number[]): Summary5 | null {
  if (!values.length) return null
  const v = [...values].sort((a, b) => a - b)
  const at = (q: number) => {
    const i = (v.length - 1) * q
    const lo = Math.floor(i)
    const hi = Math.ceil(i)
    return v[lo] + (v[hi] - v[lo]) * (i - lo)
  }
  return { min: v[0], p50: at(0.5), p90: at(0.9), mean: v.reduce((s, x) => s + x, 0) / v.length, max: v[v.length - 1] }
}

const median = (v: number[]) => summarise(v)?.p50 ?? null

/**
 * Detailed footprint statistics. Inclusion is identical to hazardAnalysis.footprint(): native 5 m sample
 * centres inside the scale-corrected radius; samples outside the raster count as unavailable.
 */
export function footprintDetail(
  hz: HazardData,
  asset: TerrainAsset,
  centre: { lat: number; lon: number },
  centreElevationM: number,
  radiusM: number,
  criteria: Criteria,
): FootprintDetail | null {
  const base = footprint(hz, centre.lat, centre.lon, radiusM, centreElevationM, criteria)
  if (!base) return null
  const m = hz.meta
  const p = polarXY(centre.lat, centre.lon)
  const radius = base.projectedRadiusM
  const slopes: number[] = []
  const roughs: number[] = []
  const hist = new Array<number>(SLOPE_BINS.length - 1).fill(0)
  let exceedSlope = 0
  let exceedRoughness = 0
  for (let row = Math.ceil((p.y + radius - m.y0) / m.dy); row <= Math.floor((p.y - radius - m.y0) / m.dy); row++)
    for (let col = Math.ceil((p.x - radius - m.x0) / m.dx); col <= Math.floor((p.x + radius - m.x0) / m.dx); col++) {
      if ((m.x0 + col * m.dx - p.x) ** 2 + (m.y0 + row * m.dy - p.y) ** 2 > radius ** 2) continue
      if (row < 0 || col < 0 || row >= m.height || col >= m.width) continue
      const v = valuesAtIndex(hz, row * m.width + col)
      if (v.slope === null || v.roughness === null) continue
      slopes.push(v.slope)
      roughs.push(v.roughness)
      let b = 0
      while (b < hist.length - 1 && v.slope >= SLOPE_BINS[b + 1]) b++
      hist[b]++
      if (criteriaValid(criteria)) {
        if (v.slope > criteria.slope) exceedSlope++
        if (v.roughness > criteria.roughness) exceedRoughness++
      }
    }
  // 20 m display grid: elevation range and uncertainty inside the same disk
  const t = asset.meta
  const heights: number[] = []
  const errs: number[] = []
  for (
    let r = Math.max(0, Math.ceil((p.y + radius - t.y0) / t.dy));
    r <= Math.min(t.height - 1, Math.floor((p.y - radius - t.y0) / t.dy));
    r++
  )
    for (
      let c = Math.max(0, Math.ceil((p.x - radius - t.x0) / t.dx));
      c <= Math.min(t.width - 1, Math.floor((p.x + radius - t.x0) / t.dx));
      c++
    ) {
      if ((t.x0 + c * t.dx - p.x) ** 2 + (t.y0 + r * t.dy - p.y) ** 2 > radius ** 2) continue
      const h = asset.heights[r * t.width + c]
      if (Number.isFinite(h)) heights.push(h)
      const e = asset.errors[r * t.width + c]
      if (Number.isFinite(e)) errs.push(e)
    }
  return {
    centre: { lat: centre.lat, lon: centre.lon },
    radiusM,
    projectedRadiusM: radius,
    total: base.total,
    valid: base.valid,
    coveragePct: base.coveragePct,
    meets: base.meets,
    meetsPct: base.meetsPct,
    exceedSlope,
    exceedRoughness,
    slope: summarise(slopes),
    roughness: summarise(roughs),
    slopeHistogram: hist,
    elevation: heights.length ? { min: Math.min(...heights), max: Math.max(...heights), samples: heights.length } : null,
    uncertaintyMedianM: median(errs),
    sampleAreaM2: base.valid * Math.abs(m.dx * m.dy),
    nominalAreaM2: Math.PI * radiusM * radiusM,
  }
}

export type FootprintStatus = 'meets' | 'fails' | 'insufficient'

export interface Screening {
  status: FootprintStatus
  reasons: string[]
}

/**
 * Transparent user-configured screen (not a safety certification):
 *  - insufficient: no footprint, invalid thresholds, or any sample in the disk unavailable
 *  - meets: the share of valid samples meeting both criteria is at least `minMeetsPct`
 *  - fails: otherwise, with the decisive counts
 */
export function screenFootprint(d: FootprintDetail | null, criteria: Criteria, minMeetsPct: number): Screening {
  if (!d) return { status: 'insufficient', reasons: ['No footprint: choose a radius between 5 and 2000 m.'] }
  if (!criteriaValid(criteria) || !Number.isFinite(minMeetsPct) || minMeetsPct < 0 || minMeetsPct > 100)
    return { status: 'insufficient', reasons: ['Thresholds are incomplete or out of range.'] }
  if (d.valid < d.total || d.meetsPct === null)
    return {
      status: 'insufficient',
      reasons: [
        `Only ${d.valid} of ${d.total} samples in the footprint have data (${d.coveragePct.toFixed(1)}% coverage). Missing terrain is never counted as favourable.`,
      ],
    }
  const share = `${d.meetsPct.toFixed(1)}% of ${d.valid} native 5 m samples meet both criteria (required: ${minMeetsPct}%).`
  if (d.meetsPct >= minMeetsPct) return { status: 'meets', reasons: [share] }
  const reasons = [share]
  if (d.exceedSlope)
    reasons.push(`${d.exceedSlope} samples (${((100 * d.exceedSlope) / d.valid).toFixed(1)}%) are steeper than ${criteria.slope}°.`)
  if (d.exceedRoughness)
    reasons.push(
      `${d.exceedRoughness} samples (${((100 * d.exceedRoughness) / d.valid).toFixed(1)}%) are rougher than ${criteria.roughness} m RMS.`,
    )
  return { status: 'fails', reasons }
}

export interface SiteResult {
  name: string
  detail: FootprintDetail | null
  screening: Screening
}

/** Trade-off text built only from computed numbers; never declares a site certified or universally better. */
export function compareFootprints(a: SiteResult, b: SiteResult): string[] {
  const out: string[] = []
  const ok = (r: SiteResult) => r.screening.status === 'meets'
  const ins = (r: SiteResult) => r.screening.status === 'insufficient'
  if (ins(a) || ins(b)) {
    for (const r of [a, b])
      if (ins(r)) out.push(`${r.name}: insufficient data for this footprint, so it is not ranked. ${r.screening.reasons[0]}`)
    if (ins(a) && ins(b)) return out
  }
  if (!ins(a) && !ins(b)) {
    if (ok(a) && ok(b)) out.push(`Both footprints meet the configured criteria.`)
    else if (ok(a)) out.push(`Only ${a.name} meets the configured criteria; ${b.name} does not.`)
    else if (ok(b)) out.push(`Only ${b.name} meets the configured criteria; ${a.name} does not.`)
    else out.push(`Neither footprint meets the configured criteria. Try a smaller radius, a lower required share, or a different centre.`)
  }
  const both = [a, b].filter((r) => !ins(r) && r.detail?.meetsPct !== null && r.detail?.meetsPct !== undefined)
  if (both.length === 2) {
    const [x, y] = both[0].detail!.meetsPct! >= both[1].detail!.meetsPct! ? both : [both[1], both[0]]
    if (x.detail!.meetsPct === y.detail!.meetsPct)
      out.push(`Screening score is tied at ${x.detail!.meetsPct!.toFixed(1)}% of samples meeting both criteria.`)
    else
      out.push(
        `Screening score (share of samples meeting both criteria): ${x.name} ${x.detail!.meetsPct!.toFixed(1)}% vs ${y.name} ${y.detail!.meetsPct!.toFixed(1)}%.`,
      )
    const sa = a.detail!.slope!
    const sb = b.detail!.slope!
    if (sa && sb && Math.abs(sa.p50 - sb.p50) >= 0.5)
      out.push(
        `${sa.p50 > sb.p50 ? a.name : b.name} is steeper: median slope ${Math.max(sa.p50, sb.p50).toFixed(1)}° vs ${Math.min(sa.p50, sb.p50).toFixed(1)}°.`,
      )
    const ra = a.detail!.roughness!
    const rb = b.detail!.roughness!
    if (ra && rb && Math.abs(ra.p50 - rb.p50) >= 0.01)
      out.push(
        `${ra.p50 > rb.p50 ? a.name : b.name} is rougher at 25 m support: median ${Math.max(ra.p50, rb.p50).toFixed(3)} m vs ${Math.min(ra.p50, rb.p50).toFixed(3)} m RMS.`,
      )
  }
  out.push('This is a user-configured terrain screen on interpolated LOLA data, not a landing-safety assessment.')
  return out
}

/** Classify every native sample for a texture or count (exported for tests and the overlay). */
export const classifyIndex = (hz: HazardData, i: number, c: Criteria) => {
  const v = valuesAtIndex(hz, i)
  return classify(v.slope, v.roughness, c)
}

/**
 * Milestone 6: finder terrain screen from an equal-footprint measurement. Any unavailable sample in the footprint
 * makes the terrain unknown (never a pass); only processed 5 m sites can be screened.
 */
export function terrainScreenFrom(d: FootprintDetail | null, product: string, siteName: string): TerrainScreen {
  if (!d)
    return { meetsPct: null, reason: `The terrain footprint at ${siteName} could not be evaluated (radius must be 5–2000 m).`, product }
  if (d.valid < d.total || d.meetsPct === null)
    return {
      meetsPct: null,
      reason: `Only ${d.valid} of ${d.total} native 5 m samples in the ${d.radiusM} m footprint at ${siteName} have data (${d.coveragePct.toFixed(1)} % coverage).`,
      product,
    }
  return {
    meetsPct: d.meetsPct,
    reason: `${d.meetsPct.toFixed(1)} % of ${d.valid} native 5 m samples meet both limits (NASA PGDA ${product}).`,
    product,
  }
}

export const NO_TERRAIN = (siteName: string): TerrainScreen => ({
  meetsPct: null,
  reason: `No processed 5 m terrain covers ${siteName}, so slope and roughness are unknown there (terrain from other sites is never reused).`,
})
