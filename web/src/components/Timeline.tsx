import { useMemo, useRef } from 'react'
import type { Interval, Sample } from '../lib/analysis'
import { DAY } from '../lib/analysis'
import { fmtDuration, fmtPct, fmtTime } from '../lib/format'
import { percentCovered } from '../lib/physics/windows'
import { usePrefs } from '../lib/prefs'
import { useWidth } from './ui'

interface Props {
  samples: Sample[]
  t0: number
  t1: number
  cursor?: number
  sun: Interval[]
  earth: Interval[]
  both: Interval[]
  onPick?: (t: number) => void
  compact?: boolean
  relative?: boolean
  label?: string
}

/** SVG patterns so lanes differ by texture as well as colour (colour-blind safe). */
export function LanePatterns() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <pattern id="pat-earth" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="var(--c-earth)" />
          <rect width="6" height="1.6" fill="var(--c-bg)" opacity="0.45" />
        </pattern>
        <pattern id="pat-both" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--c-both)" />
          <rect width="1.8" height="6" fill="var(--c-bg)" opacity="0.4" />
        </pattern>
      </defs>
    </svg>
  )
}

export default function Timeline({ samples, t0, t1, cursor, sun, earth, both, onPick, compact, relative, label }: Props) {
  const { tz } = usePrefs()
  const [box, W] = useWidth<HTMLDivElement>(compact ? 400 : 900)
  const narrow = W < 560
  const curveH = compact ? 0 : narrow ? 90 : 130
  const laneH = compact ? 10 : 16
  const gap = compact ? 4 : 6
  const top = 10
  const lanesY = top + curveH + (compact ? 0 : 14)
  const H = lanesY + 3 * (laneH + gap) + (compact ? 16 : 22)
  const L = compact ? 14 : narrow ? 66 : 96
  const R = compact ? 18 : 12
  const pw = W - L - R
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * pw
  const svgRef = useRef<SVGSVGElement>(null)

  const { lo, hi } = useMemo(() => {
    let lo = -3
    let hi = 3
    for (const s of samples) {
      lo = Math.min(lo, s.sunUpper, s.earthUpper)
      hi = Math.max(hi, s.sunUpper, s.earthUpper)
    }
    return { lo: Math.max(lo, -15), hi: Math.min(hi, 90) }
  }, [samples])
  const y = (v: number) => top + ((hi - Math.max(lo, Math.min(hi, v))) / (hi - lo)) * curveH
  const line = (f: (s: Sample) => number) => samples.map((s) => `${x(s.t).toFixed(1)},${y(f(s)).toFixed(1)}`).join(' ')

  const days = (t1 - t0) / DAY
  const pxPerDay = pw / days
  const tickEvery = [1, 2, 3, 7, 14, 30].find((d) => d * pxPerDay >= (compact ? 34 : 46)) ?? 30
  const ticks: number[] = []
  const first = relative ? t0 : Math.ceil(t0 / DAY) * DAY
  for (let t = first; t <= t1 + 1; t += tickEvery * DAY) ticks.push(t)

  const pick = (clientX: number) => {
    if (!onPick || !svgRef.current) return
    const r = svgRef.current.getBoundingClientRect()
    const t = t0 + ((((clientX - r.left) / r.width) * W - L) / pw) * (t1 - t0)
    onPick(Math.max(t0, Math.min(t1, t)))
  }

  const lanes: [Interval[], string, string][] = [
    [sun, 'sun', 'Sunlight'],
    [earth, 'earth', 'Earth link'],
    [both, 'both', 'Both'],
  ]
  const summary = `${label ?? 'Timeline'} from ${fmtTime(t0, tz, false)} to ${fmtTime(t1, tz, false)}: sunlight ${fmtPct(
    percentCovered(sun, t0, t1),
  )}, Earth link ${fmtPct(percentCovered(earth, t0, t1))}, both ${fmtPct(percentCovered(both, t0, t1))}.`

  return (
    <div ref={box} className={`timeline ${compact ? 'compact' : ''}`}>
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className={onPick ? 'pickable' : ''}
        onClick={(e) => pick(e.clientX)}
        role="img"
        aria-label={summary}
      >
        {!compact && (
          <g>
            <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="grid zero" />
            <text x={L - 8} y={y(0) + 4} textAnchor="end" className="tick">
              terrain
            </text>
            <text x={L - 8} y={top + 10} textAnchor="end" className="tick">
              +{Math.round(hi)}°
            </text>
            <polyline points={line((s) => s.sunUpper)} className="curve sun" />
            <polyline points={line((s) => s.earthUpper)} className="curve earth" />
          </g>
        )}
        {lanes.map(([iv, cls, name], i) => (
          <g key={cls}>
            {!compact && (
              <text x={L - 8} y={lanesY + i * (laneH + gap) + laneH - 4} textAnchor="end" className="tick">
                {name}
              </text>
            )}
            <rect x={L} y={lanesY + i * (laneH + gap)} width={pw} height={laneH} className="lane-bg" rx={3} />
            {iv.map((v, k) => (
              <rect
                key={k}
                x={x(Math.max(t0, v.start))}
                y={lanesY + i * (laneH + gap)}
                width={Math.max(1, x(Math.min(t1, v.end)) - x(Math.max(t0, v.start)))}
                height={laneH}
                className={`lane lane-${cls}`}
                rx={3}
              >
                <title>{`${name}: ${fmtTime(v.start, tz)} to ${fmtTime(v.end, tz)} (${fmtDuration(v.end - v.start)})`}</title>
              </rect>
            ))}
          </g>
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={lanesY - 2} y2={H - (compact ? 14 : 18)} className="grid" />
            <text x={x(t)} y={H - 4} className="tick" textAnchor={x(t) - L < 14 ? 'start' : W - R - x(t) < 14 ? 'end' : 'middle'}>
              {relative ? `+${Math.round((t - t0) / DAY)} d` : fmtTime(t, tz, false).slice(5)}
            </text>
          </g>
        ))}
        {cursor !== undefined && cursor >= t0 && cursor <= t1 && (
          <line x1={x(cursor)} x2={x(cursor)} y1={top} y2={H - 18} className="cursor" />
        )}
      </svg>
    </div>
  )
}
