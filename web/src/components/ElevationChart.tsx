import { useMemo, useState } from 'react'
import type { Sample } from '../lib/analysis'
import { fmtDeg, fmtTime } from '../lib/format'
import { HOUR, useStore } from '../lib/store'
import { type Body, MODEL_SHORT, signal } from '../lib/visibility'
import { useWidth } from './ui'

export interface SiteSeries {
  slot: 'A' | 'B'
  name: string
  samples: Sample[]
}

interface Props {
  body: Body
  series: SiteSeries[]
  t0: number
  t1: number
}

const elOf = (b: Body) => (s: Sample) => (b === 'sun' ? s.sunEl : s.earthEl)

/** Elevation vs UTC time for Site A and Site B, synchronized with the shared selected time. */
export default function ElevationChart({ body, series, t0, t1 }: Props) {
  const { s, set } = useStore()
  const [box, W] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = W < 560 ? 200 : 230
  const M = { l: 46, r: 12, t: 12, b: 26 }
  const pw = W - M.l - M.r
  const ph = H - M.t - M.b
  const el = elOf(body)
  const { lo, hi } = useMemo(() => {
    let lo = -2
    let hi = 2
    for (const x of series)
      for (const v of x.samples) {
        lo = Math.min(lo, el(v))
        hi = Math.max(hi, el(v))
      }
    const pad = Math.max(0.5, (hi - lo) * 0.08)
    return { lo: Math.floor(lo - pad), hi: Math.ceil(hi + pad) }
  }, [series, el])
  const x = (t: number) => M.l + ((t - t0) / (t1 - t0)) * pw
  const y = (v: number) => M.t + ((hi - v) / (hi - lo)) * ph

  const paths = useMemo(
    () =>
      series.map((sr) => {
        // split into visible / hidden segments under the active model
        const segs: { d: string; vis: boolean }[] = []
        let cur: { pts: string[]; vis: boolean } | null = null
        for (const v of sr.samples) {
          const vis = signal(v, body, s.vis) > 0
          const pt = `${x(v.t).toFixed(1)},${y(el(v)).toFixed(1)}`
          if (!cur || cur.vis !== vis) {
            if (cur) {
              cur.pts.push(pt)
              segs.push({ d: 'M' + cur.pts.join(' L'), vis: cur.vis })
            }
            cur = { pts: [pt], vis }
          } else cur.pts.push(pt)
        }
        if (cur) segs.push({ d: 'M' + cur.pts.join(' L'), vis: cur.vis })
        return { slot: sr.slot, segs }
      }),
    // x/y derive from the listed values
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, body, s.vis, lo, hi, W, t0, t1],
  )

  const step = series[0]?.samples.length ? (t1 - t0) / 86_400_000 : 1
  const tickDays = [1, 2, 3, 7, 14].find((d) => (d / step) * pw >= 56) ?? 14
  const ticks: number[] = []
  if (step <= 1.01) for (let t = Math.ceil(t0 / (6 * HOUR)) * 6 * HOUR; t <= t1; t += 6 * HOUR) ticks.push(t)
  else for (let t = Math.ceil(t0 / 86_400_000) * 86_400_000; t <= t1; t += tickDays * 86_400_000) ticks.push(t)
  const yStep = hi - lo > 40 ? 10 : hi - lo > 16 ? 5 : hi - lo > 6 ? 2 : 1
  const yTicks: number[] = []
  for (let v = Math.ceil(lo / yStep) * yStep; v <= hi; v += yStep) yTicks.push(v)

  const timeAt = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W
    const t = t0 + ((px - M.l) / pw) * (t1 - t0)
    return Math.round(Math.max(t0, Math.min(t1, t)) / HOUR) * HOUR
  }
  const hoverIdx = hover === null ? -1 : Math.round((hover - t0) / HOUR)
  const title = body === 'sun' ? 'Sun elevation' : 'Earth elevation'
  const visWord = body === 'sun' ? 'sunlit' : 'Earth in view'
  const summary = series
    .map((sr) => {
      const vals = sr.samples.map(el)
      const visN = sr.samples.filter((v) => signal(v, body, s.vis) > 0).length
      return `Site ${sr.slot}, ${sr.name}: from ${fmtDeg(Math.min(...vals))} to ${fmtDeg(Math.max(...vals))}, ${visWord} ${Math.round((100 * visN) / Math.max(1, vals.length))} % of the time`
    })
    .join('. ')

  return (
    <figure className="chart-frame" aria-labelledby={`chart-${body}`}>
      <div className="chart-head">
        <h3 id={`chart-${body}`} className="chart-title">
          {title} vs time
        </h3>
        <div className="legend" aria-hidden>
          <span className="lg lg-a">Site A</span>
          <span className="lg lg-b">Site B</span>
          <span className="lg lg-hidden">not visible ({MODEL_SHORT[s.vis]})</span>
        </div>
      </div>
      <div ref={box} className="chart-box">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${title} for both sites. ${summary}.`}
          className="pickable"
          onPointerMove={(e) => setHover(timeAt(e.clientX, e.currentTarget.getBoundingClientRect()))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => set({ selectedTime: timeAt(e.clientX, e.currentTarget.getBoundingClientRect()) })}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'grid zero' : 'grid'} />
              <text x={M.l - 6} y={y(v) + 4} textAnchor="end" className="tick">
                {v}°
              </text>
            </g>
          ))}
          {lo < 0 && hi > 0 && (
            <text x={W - M.r - 4} y={y(0) - 4} textAnchor="end" className="tick">
              0° geometric horizon
            </text>
          )}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={M.t} y2={H - M.b} className="grid" />
              <text x={x(t)} y={H - 8} className="tick" textAnchor="middle">
                {step <= 1.01 ? fmtTime(t, s.tz).slice(11, 16) : fmtTime(t, s.tz, false).slice(5)}
              </text>
            </g>
          ))}
          {paths.map((p) =>
            p.segs.map((g, i) => (
              <path key={`${p.slot}${i}`} d={g.d} className={`eline site-${p.slot.toLowerCase()} ${g.vis ? '' : 'hidden'}`} />
            )),
          )}
          <line x1={x(s.selectedTime)} x2={x(s.selectedTime)} y1={M.t} y2={H - M.b} className="cursor" />
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} className="hover-line" />}
        </svg>
        {hover !== null && hoverIdx >= 0 && (
          <div className="readout num" style={{ left: Math.min(Math.max(x(hover) + 10, 8), W - 230), top: 8 }} aria-hidden>
            <div className="ro-time">{fmtTime(hover, s.tz)}</div>
            {series.map((sr) => {
              const v = sr.samples[hoverIdx]
              if (!v) return null
              const vis = signal(v, body, s.vis) > 0
              return (
                <div key={sr.slot}>
                  <span className={`site-tag tag-${sr.slot.toLowerCase()}`}>{sr.slot}</span> {fmtDeg(el(v))},{' '}
                  {vis ? visWord : body === 'sun' ? 'dark' : 'no Earth link'}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <figcaption>
        Values above 0° mean the {body === 'sun' ? "Sun's" : "Earth's"} centre is above the smooth geometric horizon, which is not
        necessarily above nearby terrain. Faded parts are not visible under the {s.vis === 'terrain' ? 'terrain-aware' : 'geometric'} model.
        Select the chart to move the time.
      </figcaption>
    </figure>
  )
}
