import BlockerPanel from '../components/BlockerPanel'
import { Suspense, lazy, useMemo, useState } from 'react'
import { makeCtx, nextEvent, sampleAt, summarize } from '../lib/analysis'
import { fmtTime } from '../lib/format'
import { DEFAULT_STATE } from '../lib/state'
import { DAY, missionEnd, useStore } from '../lib/store'
import { MODEL_LABEL } from '../lib/visibility'
import { reason } from '../lib/explain'
import CompareLanes from '../components/CompareLanes'
import CompareTable from '../components/CompareTable'
import ElevationChart from '../components/ElevationChart'
import MissionControls from '../components/MissionControls'
import MissionCheck from '../components/MissionCheck'
import SitePair from '../components/SitePair'
import SiteStatus from '../components/SiteStatus'
import TimeBar from '../components/TimeBar'
import { ErrorBoundary, Skeleton } from '../components/ui'
import type { Scenario } from '../components/Compare'

const PolarMap = lazy(() => import('../components/PolarMap'))
const Compare = lazy(() => import('../components/Compare'))

export default function ExploreCompare() {
  const store = useStore()
  const { s, set, data, site, sites, theme, addCustom } = store
  const A = site(s.siteA)
  const B = site(s.siteB)
  const t0 = s.missionStart
  const t1 = missionEnd(s)
  const azStep = data.sites.azStepDeg

  const ctxA = useMemo(() => makeCtx(A, azStep), [A, azStep])
  const ctxB = useMemo(() => makeCtx(B, azStep), [B, azStep])
  const ra = useMemo(() => summarize(ctxA, data.eph, t0, t1, s.vis), [ctxA, data, t0, t1, s.vis])
  const rb = useMemo(() => summarize(ctxB, data.eph, t0, t1, s.vis), [ctxB, data, t0, t1, s.vis])
  const nowA = useMemo(() => sampleAt(ctxA, data.eph, s.selectedTime), [ctxA, data, s.selectedTime])
  const nowB = useMemo(() => sampleAt(ctxB, data.eph, s.selectedTime), [ctxB, data, s.selectedTime])
  const ev = useMemo(
    () => ({
      aS: nextEvent(ctxA, data.eph, s.selectedTime, 'sun', s.vis),
      aE: nextEvent(ctxA, data.eph, s.selectedTime, 'earth', s.vis),
      bS: nextEvent(ctxB, data.eph, s.selectedTime, 'sun', s.vis),
      bE: nextEvent(ctxB, data.eph, s.selectedTime, 'earth', s.vis),
    }),
    [ctxA, ctxB, data, s.selectedTime, s.vis],
  )
  const [scenarios, setScenarios] = useState<Scenario[]>(() => [
    { key: 'a', siteId: s.siteA, t0: s.missionStart },
    { key: 'b', siteId: s.siteA, t0: s.missionStart + 30 * DAY },
  ])

  return (
    <div className="workspace compare-ws">
      <aside className="rail" aria-label="Sites and mission period">
        <SitePair />
        <MissionControls />
        <Suspense fallback={<Skeleton h={360} />}>
          <ErrorBoundary label="The map">
            <PolarMap
              sites={sites}
              siteA={s.siteA}
              siteB={s.siteB}
              theme={theme}
              onSelect={(id, slot) => set(slot === 'A' ? { siteA: id } : { siteB: id })}
              onPick={(lat, lon, slot) => void addCustom(lat, lon, slot)}
            />
          </ErrorBoundary>
        </Suspense>
        <div className="adv">
          <MissionCheck v={data.validation} compact />
        </div>
      </aside>

      <section className="stage" aria-labelledby="ws-title">
        <div className="stage-head">
          <div>
            <h2 id="ws-title">Explore and compare</h2>
            <p className="lede">
              {A.name} vs {B.name}, {fmtTime(t0, s.tz, false)} to {fmtTime(t1, s.tz, false)} ({s.durationDays} d).
            </p>
            <p className="model-label adv">{MODEL_LABEL[s.vis]}</p>
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={() => set({ ws: 'finder', searchStart: s.missionStart })}>
              Open in Mission Window Finder
            </button>
            <button type="button" className="btn" onClick={() => set({ ws: 'surface' })}>
              Inspect in Surface View
            </button>
            <button type="button" className="btn" onClick={() => store.openSummary({ kind: 'compare' })}>
              Generate mission summary
            </button>
            <button
              type="button"
              className="btn quiet"
              onClick={() =>
                set({
                  siteA: DEFAULT_STATE.siteA,
                  siteB: DEFAULT_STATE.siteB,
                  missionStart: DEFAULT_STATE.missionStart,
                  durationDays: DEFAULT_STATE.durationDays,
                  selectedTime: DEFAULT_STATE.selectedTime,
                })
              }
            >
              Reset comparison
            </button>
          </div>
        </div>

        <div className="status-pair">
          <SiteStatus site={A} slot="A" now={nowA} sunEv={ev.aS} earthEv={ev.aE} />
          <SiteStatus site={B} slot="B" now={nowB} sunEv={ev.bS} earthEv={ev.bE} />
        </div>
        <BlockerPanel
          sites={[
            { slot: 'A', site: A, samples: ra.samples },
            { slot: 'B', site: B, samples: rb.samples },
          ]}
          azStepDeg={data.sites.azStepDeg}
        />
        <TimeBar />
        {s.mode === 'explore' && (
          <aside className="explain" aria-label="Plain-language explanation">
            <h3>What you are seeing</h3>
            <p>
              <b>Site A, {A.name}.</b> {reason(nowA, 'sun', s.vis)} {reason(nowA, 'earth', s.vis)}
            </p>
            <p>
              <b>Site B, {B.name}.</b> {reason(nowB, 'sun', s.vis)} {reason(nowB, 'earth', s.vis)}
            </p>
            <p>
              Near the poles the Sun never climbs high: it circles the horizon once a month, so hills cast shadows kilometres long and a few
              hundred metres can change everything. Earth hangs almost still in the lunar sky but wobbles a few degrees each month
              (libration), which can hide it behind nearby terrain.
            </p>
          </aside>
        )}
        <ElevationChart
          body="sun"
          t0={t0}
          t1={t1}
          series={[
            { slot: 'A', name: A.name, samples: ra.samples },
            { slot: 'B', name: B.name, samples: rb.samples },
          ]}
        />
        <ElevationChart
          body="earth"
          t0={t0}
          t1={t1}
          series={[
            { slot: 'A', name: A.name, samples: ra.samples },
            { slot: 'B', name: B.name, samples: rb.samples },
          ]}
        />
        <CompareLanes a={ra.samples} b={rb.samples} t0={t0} t1={t1} />
        <CompareTable A={ra.sum} B={rb.sum} nameA={A.name} nameB={B.name} />

        <details className="more adv">
          <summary>Compare the same site on different dates</summary>
          <Suspense fallback={<Skeleton h={200} />}>
            <Compare
              data={data}
              sites={sites}
              scenarios={scenarios}
              setScenarios={setScenarios}
              windowDays={s.durationDays}
              onOpen={(sc) => set({ siteA: sc.siteId, missionStart: sc.t0, selectedTime: sc.t0 })}
            />
          </Suspense>
        </details>
      </section>
    </div>
  )
}
