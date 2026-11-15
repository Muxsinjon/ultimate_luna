import { useEffect, useMemo, useState } from 'react'
import { hourly, makeCtx, sampleAt, summarize } from '../lib/analysis'
import { prepare, search } from '../lib/finder'
import { fmtDeg, fmtHours, fmtPct, fmtTime } from '../lib/format'
import { DEFAULT_STATE } from '../lib/state'
import { DAY, HOUR, useStore } from '../lib/store'

/**
 * Guided demo. Every number in the step text is computed live from the same data as the charts;
 * the scenario (Nobile Rim 2 vs Connecting Ridge, 14 days from 2026-11-14) was chosen because it shows
 * a real ridge sunset and a real change in feasibility when a requirement changes.
 */
export default function Demo({ onClose }: { onClose: () => void }) {
  const store = useStore()
  const { set, data, site } = store
  const [step, setStep] = useState(0)
  const A = site('nobile-rim-2')
  const B = site('connecting-ridge')
  const t0 = DEFAULT_STATE.missionStart
  const t1 = t0 + 14 * DAY
  const moment = DEFAULT_STATE.selectedTime

  const facts = useMemo(() => {
    const ca = makeCtx(A, data.sites.azStepDeg)
    const cb = makeCtx(B, data.sites.azStepDeg)
    const sa = summarize(ca, data.eph, t0, t1, 'terrain').sum
    const sb = summarize(cb, data.eph, t0, t1, 'terrain').sum
    const now = sampleAt(ca, data.eph, moment)
    // feasibility before/after tightening the blackout limit, for both sites over 3 months
    const prep = [A, B].map((x) => {
      const h = hourly(makeCtx(x, data.sites.azStepDeg), data.eph, 'terrain')
      return prepare({ siteId: x.id, sun: h.sun, earth: h.earth })
    })
    const base = {
      sites: prep,
      t0Ms: data.eph.meta.startMs,
      stepMs: data.eph.meta.stepMs,
      searchStartMs: t0,
      searchEndMs: DEFAULT_STATE.searchEnd,
      everyH: 6,
      durationH: 14 * 24,
    }
    const before = search({ ...base, req: DEFAULT_STATE.req }).filter((c) => c.status === 'meets').length
    const tight = { ...DEFAULT_STATE.req, maxBlackoutH: 12 }
    const after = search({ ...base, req: tight }).filter((c) => c.status === 'meets').length
    return { sa, sb, now, before, after, tight }
  }, [A, B, data, t0, t1, moment])

  const steps: { title: string; text: string; go: () => void }[] = [
    {
      title: 'Two candidate south-pole sites',
      text: `Site A is ${A.name} and Site B is ${B.name}. Both are near the lunar south pole, where the Sun never climbs high. Their coordinates come from published Artemis III site studies.`,
      go: () => set({ ws: 'compare', siteA: A.id, siteB: B.id, missionStart: t0, durationDays: 14, selectedTime: t0, vis: 'terrain' }),
    },
    {
      title: 'Where they are',
      text: 'The map shows the south pole with the LOLA team’s long-term sunlight map. Site A and Site B are labelled on it. You can click any spot to analyse it.',
      go: () => document.getElementById('map-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    },
    {
      title: 'A 14-day mission period',
      text: `The mission runs from ${fmtTime(t0, 'utc', false)} to ${fmtTime(t1, 'utc', false)}. Every chart, table and the surface view use this period and the same selected time.`,
      go: () => document.getElementById('ws-title')?.scrollIntoView({ behavior: 'smooth' }),
    },
    {
      title: 'Compare sunlight and Earth visibility',
      text: `Over these 14 days, ${A.name} is sunlit ${fmtPct(facts.sa.sunPct)} of the time with Earth in view ${fmtPct(facts.sa.earthPct)}. ${B.name} is sunlit ${fmtPct(facts.sb.sunPct)} with Earth in view ${fmtPct(facts.sb.earthPct)}. The table below spells out the trade-offs.`,
      go: () => document.getElementById('cmp-table-h')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    },
    {
      title: 'An unfavourable moment',
      text: `At ${fmtTime(moment, 'utc')} the Sun at ${A.name} is ${fmtDeg(facts.now.sunEl)} above a flat horizon, yet terrain in that direction rises to ${fmtDeg(facts.now.sunHorizon)}. The site is about to lose sunlight. Its longest darkness in this period is ${fmtHours(Math.round(facts.sa.longestDarkMs / HOUR))}.`,
      go: () => set({ ws: 'compare', selectedTime: moment }),
    },
    {
      title: 'See it from the surface',
      text: 'Surface View shows the same site and time from an observer’s eyes: a black sky, the real terrain silhouette, and the Sun sliding behind the ridge.',
      go: () => set({ ws: 'surface', surfaceSite: 'A', selectedTime: moment }),
    },
    {
      title: 'Why it happens',
      text: 'The explanation under the view is built from the calculated angles: the Sun’s elevation versus the terrain height at the same azimuth. Use “Look at the Sun” to face it.',
      go: () => set({ ws: 'surface' }),
    },
    {
      title: 'Find mission windows',
      text: `The Mission Window Finder checks every start from ${fmtTime(t0, 'utc', false)} to ${fmtTime(DEFAULT_STATE.searchEnd, 'utc', false)} against your requirements. With the illustrative defaults, ${facts.before} candidate starts at these two sites meet every requirement.`,
      go: () => {
        set({ ws: 'finder', durationDays: 14, searchStart: t0, searchEnd: DEFAULT_STATE.searchEnd, req: DEFAULT_STATE.req })
        store.runFinder()
      },
    },
    {
      title: 'Change a requirement',
      text: `Tighten the maximum communication blackout from ${DEFAULT_STATE.req.maxBlackoutH} h to ${facts.tight.maxBlackoutH} h and recalculate: the number of fully feasible starts at these two sites goes from ${facts.before} to ${facts.after}. Select “Why this window?” on any row to see exactly which requirement fails and by how much.`,
      go: () => {
        set({ ws: 'finder', req: facts.tight })
        store.runFinder()
      },
    },
    {
      title: 'Assumptions and summary',
      text: 'The Data and methods page lists every data source, assumption and limitation. Generate a mission summary to print or save the analysis.',
      go: () => {
        set({ ws: 'compare', req: DEFAULT_STATE.req })
        store.openSummary({ kind: 'compare' })
      },
    },
  ]

  useEffect(() => {
    steps[step].go()
    // run each step's action once when the step changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const s = steps[step]
  return (
    <aside className="demo" aria-labelledby="demo-h" aria-live="polite">
      <div className="demo-head">
        <span className="muted small num">
          Guided demo, step {step + 1} of {steps.length}
        </span>
        <button type="button" className="btn quiet" onClick={onClose}>
          Exit demo
        </button>
      </div>
      <h2 id="demo-h">{s.title}</h2>
      <p>{s.text}</p>
      <div className="row">
        <button type="button" className="btn" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          Back
        </button>
        {step < steps.length - 1 ? (
          <button type="button" className="btn primary" onClick={() => setStep(step + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={onClose}>
            Finish
          </button>
        )}
      </div>
    </aside>
  )
}
