import { useMemo, useState } from 'react'
import type { AppData, Site } from '../lib/data'
import { DAY, makeCtx, nextEvent, summarize } from '../lib/analysis'
import { fmtDuration, fmtHoursApprox, fmtPct, fmtTime, fromInputValue, toInputValue } from '../lib/format'
import { INFO } from '../lib/glossary'
import { usePrefs } from '../lib/prefs'
import { useStore } from '../lib/store'
import { signal } from '../lib/visibility'
import Timeline from './Timeline'
import { Icon, InfoTip } from './ui'

export interface Scenario {
  key: string
  siteId: string
  t0: number
}

interface Props {
  data: AppData
  sites: Site[]
  scenarios: Scenario[]
  setScenarios: (s: Scenario[]) => void
  windowDays: number
  onOpen: (s: Scenario) => void
}

const pts = (d: number) => {
  const n = Math.abs(Math.round(d))
  return `${n} ${n === 1 ? 'pt' : 'pts'}`
}

type Row = {
  sc: Scenario
  site: Site
  t1: number
  outside: boolean
  firstSunsetMs: number | null
  sunriseMs: number | null
} & ReturnType<typeof summarize>

interface Col {
  key: string
  label: string
  info: keyof typeof INFO
  value: (r: Row) => number | null
  fmt: (v: number) => string
  higherIsBetter: boolean
  deltaFmt: (d: number) => string
}

const COLS: Col[] = [
  { key: 'sun', label: 'Sunlit', info: 'sun', value: (r) => r.sum.sunPct, fmt: fmtPct, higherIsBetter: true, deltaFmt: pts },
  { key: 'earth', label: 'Earth in view', info: 'earth', value: (r) => r.sum.earthPct, fmt: fmtPct, higherIsBetter: true, deltaFmt: pts },
  { key: 'both', label: 'Operations window', info: 'ops', value: (r) => r.sum.bothPct, fmt: fmtPct, higherIsBetter: true, deltaFmt: pts },
  {
    key: 'dark',
    label: 'Longest dark',
    info: 'dark',
    value: (r) => r.sum.longestDarkMs,
    fmt: fmtDuration,
    higherIsBetter: false,
    deltaFmt: (d) => fmtDuration(Math.abs(d)),
  },
  {
    key: 'sunset',
    label: 'Sun lasts after start',
    info: 'sun',
    value: (r) => r.firstSunsetMs,
    fmt: fmtHoursApprox,
    higherIsBetter: true,
    deltaFmt: (d) => fmtDuration(Math.abs(d)),
  },
]

export default function Compare({ data, sites, scenarios, setScenarios, windowDays, onOpen }: Props) {
  const { tz } = usePrefs()
  const { s: st } = useStore()
  const vis = st.vis
  const [siteId, setSiteId] = useState(sites[0].id)
  const [date, setDate] = useState(toInputValue(scenarios[0]?.t0 ?? data.eph.meta.startMs, tz))

  const rows: Row[] = useMemo(
    () =>
      scenarios.map((sc) => {
        const site = sites.find((s) => s.id === sc.siteId) ?? sites[0]
        const ctx = makeCtx(site, data.sites.azStepDeg)
        const t1 = sc.t0 + windowDays * DAY
        const outside = sc.t0 < data.eph.meta.startMs || t1 > data.eph.endMs
        const r = summarize(ctx, data.eph, sc.t0, outside ? sc.t0 : t1, vis)
        const ev = nextEvent(ctx, data.eph, sc.t0, 'sun', vis)
        const lit = r.samples[0] ? signal(r.samples[0], 'sun', vis) > 0 : false
        return {
          sc,
          site,
          t1,
          outside,
          ...r,
          firstSunsetMs: lit && ev.time !== null ? ev.time - sc.t0 : null,
          sunriseMs: !lit && ev.time !== null ? ev.time - sc.t0 : null,
        }
      }),
    [scenarios, sites, data, windowDays, vis],
  )

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const t = fromInputValue(date, tz)
    if (!Number.isFinite(t)) return
    setScenarios([...scenarios, { key: `${siteId}-${t}-${scenarios.length}-${Date.now()}`, siteId, t0: t }])
  }

  const best = (c: Col) => {
    const vals = rows
      .filter((r) => !r.outside)
      .map(c.value)
      .filter((v): v is number => v !== null)
    if (vals.length < 2) return null
    return c.higherIsBetter ? Math.max(...vals) : Math.min(...vals)
  }

  return (
    <section className="compare" aria-labelledby="cmp-title">
      <div className="view-head">
        <div>
          <h2 id="cmp-title">Same site, different dates</h2>
          <p className="lede">
            Each row starts on its own date, and the bars line up by days since landing. The first row is the baseline: ▲ and ▼ show better
            or worse than it.
          </p>
        </div>
        <form className="addscn" onSubmit={add}>
          <label className="field">
            <span className="field-label">Site</span>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)} aria-label="Site to add">
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Landing ({tz === 'utc' ? 'UTC' : 'local time'})</span>
            <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="submit" className="btn primary">
            Add scenario
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="state-empty">
          <p className="state-title">No scenarios yet.</p>
          <p className="muted">Pick a site and a landing date above, then add it. Add a second one to see the differences.</p>
        </div>
      ) : (
        <div className="cmp-list">
          {rows.map((r, i) => (
            <article
              className={`cmp-row ${i === 0 ? 'baseline' : ''}`}
              key={r.sc.key}
              aria-label={`${r.site.name}, ${fmtTime(r.sc.t0, tz)}`}
            >
              <div className="cmp-name">
                <button type="button" className="link" onClick={() => onOpen(r.sc)}>
                  {r.site.name}
                </button>
                <span className="muted num">{fmtTime(r.sc.t0, tz)}</span>
                {i === 0 && <span className="badge neutral">Baseline</span>}
                {r.outside && (
                  <span className="field-error">Outside the supported data (2023–2031): no values are shown rather than extrapolated.</span>
                )}
                {!r.outside && r.sunriseMs !== null && (
                  <span className="muted">Starts in darkness; sunrise after {fmtHoursApprox(r.sunriseMs)}</span>
                )}
              </div>
              <dl className="cmp-metrics">
                {COLS.map((c) => {
                  const v = r.outside ? null : c.value(r)
                  const b = best(c)
                  const base = rows[0].outside ? null : c.value(rows[0])
                  const d = i > 0 && v !== null && base !== null ? v - base : null
                  const better = d !== null && d !== 0 ? d > 0 === c.higherIsBetter : null
                  return (
                    <div key={c.key} className={v !== null && b !== null && v === b ? 'best' : ''}>
                      <dt>
                        {c.label} <InfoTip info={INFO[c.info]} label={c.label} />
                      </dt>
                      <dd className="num">
                        {v === null ? '—' : c.fmt(v)}
                        {v !== null && b !== null && v === b && <span className="sr-only"> (best)</span>}
                      </dd>
                      {d !== null && better !== null && Math.abs(d) > 1e-9 && (
                        <dd className={`delta ${better ? 'up' : 'down'}`}>
                          {better ? '▲' : '▼'} {c.deltaFmt(d)} <span className="sr-only">{better ? 'better' : 'worse'} than baseline</span>
                        </dd>
                      )}
                    </div>
                  )
                })}
              </dl>
              <div className="cmp-lanes">
                <Timeline
                  compact
                  relative
                  samples={r.samples}
                  t0={r.sc.t0}
                  t1={r.t1}
                  sun={r.sum.sun}
                  earth={r.sum.earth}
                  both={r.sum.both}
                  label={r.site.name}
                />
              </div>
              <button
                type="button"
                className="btn quiet icon-only"
                aria-label={`Remove ${r.site.name} scenario`}
                onClick={() => setScenarios(scenarios.filter((s) => s.key !== r.sc.key))}
              >
                <Icon name="close" />
              </button>
            </article>
          ))}
        </div>
      )}
      <p className="legend-line">
        <span className="lg lg-sun">Sunlight</span>
        <span className="lg lg-earth">Earth in view</span>
        <span className="lg lg-both">Both: power and direct link</span>
        <span>The best value in each column is outlined.</span>
      </p>
    </section>
  )
}
