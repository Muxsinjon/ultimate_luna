import { compareFootprints, screenFootprint, SLOPE_BINS, type FootprintDetail, type SiteResult } from '../lib/terrainCompare'
import type { TerrainSiteInfo } from '../lib/terrainMesh'
import type { HazardSettings } from './hazardTexture'
import type { PaneResult } from './TerrainComparePane'

interface Side {
  name: string
  info: TerrainSiteInfo | null
  result: PaneResult | null
}

const STATUS = {
  meets: 'Meets configured criteria',
  fails: 'Does not meet configured criteria',
  insufficient: 'Insufficient data',
} as const
const f = (n: number | null | undefined, d: number, unit: string) =>
  n === null || n === undefined ? 'Unavailable' : `${n.toFixed(d)} ${unit}`

export default function TerrainComparison({ a, b, settings }: { a: Side; b: Side; settings: HazardSettings }) {
  const criteria = { slope: settings.maxSlope, roughness: settings.maxRough }
  const loading = (s: Side) => s.info !== null && s.result === null
  const toResult = (s: Side): SiteResult => {
    const detail = s.result?.detail ?? null
    const screening = s.info
      ? screenFootprint(detail, criteria, settings.minMeetsPct)
      : { status: 'insufficient' as const, reasons: ['No processed 5 m terrain covers this site.'] }
    return { name: s.name, detail, screening }
  }
  const ra = toResult(a),
    rb = toResult(b)
  const rows: [string, (d: FootprintDetail | null, s: Side, r: SiteResult) => string][] = [
    ['Screening result', (_d, _s, r) => STATUS[r.screening.status]],
    ['Terrain product', (_d, s) => (s.info ? `NASA PGDA ${s.info.product} (${s.info.readmeName})` : 'None')],
    ['Footprint centre', (d) => (d ? `${d.centre.lat.toFixed(5)}° latitude, ${d.centre.lon.toFixed(5)}° E` : 'Unavailable')],
    ['Footprint radius and nominal area', (d) => (d ? `${d.radiusM} m; ${(d.nominalAreaM2 / 1e6).toFixed(4)} km²` : 'Unavailable')],
    ['Valid 5 m samples / selected', (d) => (d ? `${d.valid} / ${d.total} (${d.coveragePct.toFixed(1)}% coverage)` : 'Unavailable')],
    ['Valid sample area (map plane)', (d) => (d ? `${(d.sampleAreaM2 / 1e6).toFixed(4)} km²` : 'Unavailable')],
    [
      'Elevation range (20 m grid)',
      (d) => (d?.elevation ? `${d.elevation.min.toFixed(1)} to ${d.elevation.max.toFixed(1)} m` : 'Unavailable'),
    ],
    [
      'Slope min / median / P90 / max',
      (d) => (d?.slope ? [d.slope.min, d.slope.p50, d.slope.p90, d.slope.max].map((n) => `${n.toFixed(2)}°`).join(' / ') : 'Unavailable'),
    ],
    [
      'Slope distribution',
      (d) =>
        d?.slope
          ? d.slopeHistogram.map((n, i) => `${SLOPE_BINS[i]}–${SLOPE_BINS[i + 1]}°: ${((100 * n) / d.valid).toFixed(1)}%`).join('; ')
          : 'Unavailable',
    ],
    [
      'Roughness min / median / P90 / max',
      (d) =>
        d?.roughness
          ? [d.roughness.min, d.roughness.p50, d.roughness.p90, d.roughness.max].map((n) => `${n.toFixed(3)} m`).join(' / ')
          : 'Unavailable',
    ],
    ['Meets both criteria', (d) => (d?.meetsPct === null || !d ? 'Unavailable' : `${d.meetsPct.toFixed(1)}% (${d.meets} samples)`)],
    ['Median source height RMS', (d) => f(d?.uncertaintyMedianM, 2, 'm')],
  ]
  const sides: [Side, SiteResult][] = [
    [a, ra],
    [b, rb],
  ]
  const trade = loading(a) || loading(b) ? ['Waiting for both terrain sites to load.'] : compareFootprints(ra, rb)
  return (
    <section className="panel" aria-labelledby="terrain-compare-heading">
      <h3 id="terrain-compare-heading">Terrain comparison (equal footprint)</h3>
      <div className="table-scroll">
        <table className="cmp-table" data-testid="terrain-comparison">
          <caption className="sr-only">Site A and Site B terrain statistics inside the same footprint radius</caption>
          <thead>
            <tr>
              <th scope="col">Quantity</th>
              <th scope="col">{a.name}</th>
              <th scope="col">{b.name}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, cell]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {sides.map(([s, r], i) => (
                  <td key={i} className="num" data-status={label === 'Screening result' ? r.screening.status : undefined}>
                    {loading(s) ? 'Loading…' : cell(r.detail, s, r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div data-testid="terrain-tradeoffs" aria-live="polite">
        <h4>Trade-offs and reasons</h4>
        <ul>
          {sides.map(([s, r], i) =>
            loading(s) ? null : (
              <li key={i}>
                {s.name}: {r.screening.reasons.join(' ')}
              </li>
            ),
          )}
          {trade.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <p className="hint">
        Method for both sites: native 5 m PGDA adjusted LOLA DEM; slope from a 3 × 3 OLS fitted plane (15 m support), roughness as detrended
        RMS over 5 × 5 samples (25 m support); sample-centre inclusion with local scale correction. NASA&apos;s supplied slope raster is
        shown only as a cross-check and never mixed into this score. Elevation range and height RMS come from the 20 m display grid inside
        the same disk. About 90% of source pixels are interpolated; boulders and small craters are not resolved.
      </p>
    </section>
  )
}
