import { terrainScreens } from '../lib/terrainScreen'
import type { TerrainScreen } from '../lib/finder'
import { PROVENANCE } from '../lib/provenance'
import { useEffect, useMemo, useRef, useState } from 'react'
import { makeCtx, summarize } from '../lib/analysis'
import { checkSentence, evaluateRequirements, metricsAt, prepare, STATUS_LABEL } from '../lib/finder'
import { hourly } from '../lib/analysis'
import { fmtHours, fmtLat, fmtLon, fmtPct, fmtTime } from '../lib/format'
import { DAY, HOUR, type SummaryContext, useStore } from '../lib/store'
import { MODEL_LABEL } from '../lib/visibility'
import { compareRows, tradeOffs } from './CompareTable'
import { Icon } from './ui'

const LIMITS = [
  'Visibility is geometric line of sight from hourly samples. It does not establish actual radio communication or guaranteed solar power.',
  'It does not assess battery capacity, landing safety, surface stability, thermal survivability, radiation, or access to water ice.',
  'Terrain-aware results use LOLA terrain at 240 m (curated polar sites); nearby boulders and slopes are not resolved. Geometric results ignore terrain entirely.',
  'Slope and roughness screening, when required, uses the processed native 5 m terrain footprint. Missing coverage is insufficient data, never a pass.',
  'Mission requirements are user-chosen, illustrative constraints, not NASA engineering standards.',
]

/** Printable mission summary with JSON export, built from the same calculations as the workspaces. */
export default function MissionSummary({ ctx, onClose }: { ctx: SummaryContext; onClose: () => void }) {
  const { s, data, site } = useStore()
  const ref = useRef<HTMLDialogElement>(null)
  const [terrainResult, setTerrainResult] = useState<{ key: string; screens: Record<string, TerrainScreen> } | null>(null)
  const terrainKey = JSON.stringify([s.req.terrain, ctx, s.siteA, s.siteB])
  useEffect(() => {
    if (!s.req.terrain) return
    let live = true
    const list = ctx.kind === 'compare' ? [site(s.siteA), site(s.siteB)] : [site(ctx.siteId)]
    terrainScreens(list, s.req.terrain).then(
      (screens) => {
        if (live) setTerrainResult({ key: terrainKey, screens })
      },
      (e: Error) => {
        if (live)
          setTerrainResult({ key: terrainKey, screens: Object.fromEntries(list.map((x) => [x.id, { meetsPct: null, reason: e.message }])) })
      },
    )
    return () => {
      live = false
    }
  }, [terrainKey, s.req.terrain, ctx, s.siteA, s.siteB, site])
  const terrainPending = !!s.req.terrain && terrainResult?.key !== terrainKey
  const screens = terrainResult?.key === terrainKey ? terrainResult.screens : undefined
  const [generated] = useState(() => Date.now())
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])

  const content = useMemo(() => {
    const azStep = data.sites.azStepDeg
    const start = ctx.kind === 'compare' ? s.missionStart : ctx.startMs
    const end = start + s.durationDays * DAY
    if (start < data.eph.meta.startMs || end > data.eph.endMs) {
      const xs = ctx.kind === 'compare' ? [site(s.siteA), site(s.siteB)] : [site(ctx.siteId)]
      return {
        title: 'Mission outside supported coverage',
        sites: xs,
        t0: start,
        t1: end,
        rows: [],
        trade: [],
        interruptions: [],
        req: xs.map(() => ({
          status: 'insufficient' as const,
          checks: [],
          reason: 'The complete mission is outside supported ephemeris coverage. No full-mission metrics are reported.',
        })),
      }
    }
    if (ctx.kind === 'compare') {
      const A = site(s.siteA)
      const B = site(s.siteB)
      const t0 = s.missionStart
      const t1 = t0 + s.durationDays * DAY
      const sa = summarize(makeCtx(A, azStep), data.eph, t0, t1, s.vis).sum
      const sb = summarize(makeCtx(B, azStep), data.eph, t0, t1, s.vis).sum
      const rows = compareRows(sa, sb)
      const evalReq = (id: string) => {
        const h = hourly(makeCtx(site(id), azStep), data.eph, s.vis)
        const p = prepare({ siteId: id, sun: h.sun, earth: h.earth })
        const i = Math.round((t0 - data.eph.meta.startMs) / data.eph.meta.stepMs)
        if (i < 0 || i + s.durationDays * 24 > p.n || t1 > data.eph.endMs) return null
        return evaluateRequirements(metricsAt(p, i, s.durationDays * 24), s.req, screens?.[id])
      }
      return {
        title: `${A.name} vs ${B.name}`,
        sites: [A, B],
        t0,
        t1,
        rows: rows.map((r) => ({ label: r.label, a: r.fmt(r.a), b: r.fmt(r.b) })),
        trade: tradeOffs(rows, A.name, B.name),
        req: [evalReq(A.id), evalReq(B.id)],
        interruptions: [
          `${A.name}: longest darkness ${fmtHours(Math.round(sa.longestDarkMs / HOUR))}, longest blackout ${fmtHours(Math.round(sa.longestNoLinkMs / HOUR))}, ${sa.linkInterruptions} blackout period(s).`,
          `${B.name}: longest darkness ${fmtHours(Math.round(sb.longestDarkMs / HOUR))}, longest blackout ${fmtHours(Math.round(sb.longestNoLinkMs / HOUR))}, ${sb.linkInterruptions} blackout period(s).`,
        ],
      }
    }
    const X = site(ctx.siteId)
    const t0 = ctx.startMs
    const t1 = t0 + s.durationDays * DAY
    const sx = summarize(makeCtx(X, azStep), data.eph, t0, t1, s.vis).sum
    const h = hourly(makeCtx(X, azStep), data.eph, s.vis)
    const p = prepare({ siteId: X.id, sun: h.sun, earth: h.earth })
    const i = Math.round((t0 - data.eph.meta.startMs) / data.eph.meta.stepMs)
    const m = metricsAt(p, i, s.durationDays * 24)
    const evaluated = evaluateRequirements(m, s.req, screens?.[X.id])
    return {
      title: `${X.name}, mission window`,
      sites: [X],
      t0,
      t1,
      rows: [
        { label: 'Sun visible', a: fmtPct(sx.sunPct), b: '' },
        { label: 'Earth visible', a: fmtPct(sx.earthPct), b: '' },
        { label: 'Sun and Earth together', a: fmtPct(sx.bothPct), b: '' },
        { label: 'Longest darkness', a: fmtHours(m.longestDarkH), b: '' },
        { label: 'Longest communication blackout', a: fmtHours(m.longestBlackoutH), b: '' },
        { label: 'Communication interruptions', a: String(m.linkInterruptions), b: '' },
      ],
      trade: [],
      req: [evaluated],
      interruptions: [
        m.darkSpan ? `Longest darkness starts ${fmtTime(data.eph.meta.startMs + m.darkSpan.startIndex * HOUR, s.tz)}.` : 'No darkness.',
        m.blackoutSpan
          ? `Longest blackout starts ${fmtTime(data.eph.meta.startMs + m.blackoutSpan.startIndex * HOUR, s.tz)}.`
          : 'No blackout.',
      ],
    }
  }, [ctx, s, data, site, screens])

  const json = () => {
    const out = {
      generated: new Date().toISOString(),
      tool: 'LunaWindow (NASA Space Apps Challenge 2026)',
      provenance: PROVENANCE,
      model: MODEL_LABEL[s.vis],
      sampling: 'hourly samples, half-open intervals, durations in whole hours',
      mission: { startUTC: new Date(content.t0).toISOString(), endUTC: new Date(content.t1).toISOString(), durationDays: s.durationDays },
      sites: content.sites.map((x) => ({ id: x.id, name: x.name, lat: x.lat, lonEast: x.lon, elevationM: x.elevationM, source: x.source })),
      requirements: s.req,
      metrics: content.rows,
      requirementChecks: content.req.map(
        (r) => r && { status: r.status, reason: r.reason, checks: r.checks.map((c) => ({ ...c, sentence: checkSentence(c) })) },
      ),
      interruptions: content.interruptions,
      tradeOffs: content.trade,
      dataSources: [
        'NASA/JPL Horizons API (DE441)',
        'LRO LOLA LDEM_75S_240M and LDEM_16 (NASA PDS)',
        'PGDA lunar polar illumination (Mazarico et al. 2011)',
        'Ephemeris coverage 2023-01-01 00:00 to 2031-12-31 18:00 UTC; no extrapolation',
      ],
      limitations: LIMITS,
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `lunawindow-summary-${new Date(content.t0).toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <dialog ref={ref} className="summary" aria-labelledby="sum-h" onClose={onClose}>
      <div className="summary-tools no-print">
        <button type="button" className="btn primary" onClick={() => window.print()} disabled={terrainPending}>
          Print or save as PDF
        </button>
        <button type="button" className="btn" onClick={json} disabled={terrainPending}>
          Download JSON
        </button>
        <button type="button" className="btn quiet icon-only" onClick={() => ref.current?.close()} aria-label="Close summary">
          <Icon name="close" />
        </button>
      </div>
      <article className="summary-body">
        <p className="muted small">LunaWindow mission summary · generated {fmtTime(generated, 'utc')}</p>
        <h2 id="sum-h">{content.title}</h2>
        <p>
          Mission {fmtTime(content.t0, s.tz)} to {fmtTime(content.t1, s.tz)} ({s.durationDays} days). {MODEL_LABEL[s.vis]}.
        </p>
        <h3>Sites</h3>
        <ul>
          {content.sites.map((x) => (
            <li key={x.id}>
              <b>{x.name}</b>: {fmtLat(x.lat)}, {fmtLon(x.lon)}, {x.elevationM.toLocaleString('en-US')} m. Source: {x.source}
              {x.verify ? ' (needs verification)' : ''}
            </li>
          ))}
        </ul>
        <h3>Visibility metrics</h3>
        <table>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              {content.sites.map((x) => (
                <th key={x.id} scope="col">
                  {x.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {content.rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td>{r.a}</td>
                {content.sites.length > 1 && <td>{r.b}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {content.trade.length > 0 && (
          <>
            <h3>Trade-offs</h3>
            {content.trade.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </>
        )}
        <h3>Mission requirements</h3>
        {terrainPending && <p role="status">Checking the native terrain footprint…</p>}
        {s.req.terrain && (
          <p>
            Terrain: maximum slope {s.req.terrain.maxSlopeDeg}°, maximum roughness {s.req.terrain.maxRoughM} m RMS, radius{' '}
            {s.req.terrain.radiusM} m, minimum {s.req.terrain.minMeetsPct}% meeting both limits.
          </p>
        )}
        <p className="small">
          Minimum sunlight {s.req.minSunPct} %, minimum Earth visibility {s.req.minEarthPct} %
          {s.req.minJointPct !== null ? `, minimum Sun and Earth together ${s.req.minJointPct} %` : ''}, maximum darkness {s.req.maxDarkH}{' '}
          h, maximum blackout {s.req.maxBlackoutH} h (illustrative user-chosen values).
        </p>
        {content.req.map(
          (r, k) =>
            r && (
              <div key={k}>
                <p>
                  <b>{content.sites[k].name}</b>: {STATUS_LABEL[r.status]} {r.reason ?? ''}
                </p>
                <ul className="small">
                  {r.checks.map((c) => (
                    <li key={c.key}>
                      {c.pass ? '✓' : '✕'} {checkSentence(c)}
                    </li>
                  ))}
                </ul>
              </div>
            ),
        )}
        <h3>Important interruptions</h3>
        <ul>
          {content.interruptions.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <h3>Data and method</h3>
        <p className="small">
          Sun and Earth positions: NASA/JPL Horizons (DE441), hourly 2023-01-01 to 2031-12-31 18:00 UTC, validated against Horizons
          topocentric values (Sun within 0.001°, Earth within 0.006°). Terrain: LRO LOLA. Visibility evaluated on hourly samples; each
          sample covers the following hour.
        </p>
        <h3>Limitations</h3>
        <ul className="small">
          {LIMITS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </article>
    </dialog>
  )
}
