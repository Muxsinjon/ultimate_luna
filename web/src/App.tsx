import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import GuideStrip from './components/GuideStrip'
import type { AppData, Site, Terrain } from './lib/data'
import { loadCore, loadTerrain } from './lib/data'
import { fmtLat, fmtLon, fmtTime } from './lib/format'
import { normalizeLon360 } from './lib/physics/lon'
import { PrefsContext, storageGet, storageSet } from './lib/prefs'
import { DEFAULT_STATE, type MissionState, clampToCoverage, fromHash, toHash } from './lib/state'
import { DAY, HOUR, type Store, StoreContext, type SummaryContext } from './lib/store'
import { customHorizon } from './lib/terrain'
import { type Theme, applyTheme } from './lib/theme'
import Header, { Mark } from './components/Header'
import { LanePatterns } from './components/Timeline'
import { ErrorBoundary, Icon, Skeleton } from './components/ui'

const loaders = {
  home: () => import('./workspaces/Welcome'),
  compare: () => import('./workspaces/ExploreCompare'),
  finder: () => import('./workspaces/MissionFinder'),
  surface: () => import('./workspaces/SurfaceView'),
  terrain: () => import('./workspaces/TerrainExplorer'),
}
// Start fetching the workspace the URL asks for in parallel with the data, instead of after it.
{
  const m = /(?:^|[#&])ws=(\w+)/.exec(window.location.hash)
  const ws = (m?.[1] ?? (storageGet('llsn.visited') ? 'compare' : 'home')) as keyof typeof loaders
  void loaders[ws]?.()
}
const Welcome = lazy(loaders.home)
const ExploreCompare = lazy(loaders.compare)
const MissionFinder = lazy(loaders.finder)
const SurfaceView = lazy(loaders.surface)
const TerrainExplorer = lazy(loaders.terrain)
const About = lazy(() => import('./components/About'))
const MissionSummary = lazy(() => import('./components/MissionSummary'))
const Demo = lazy(() => import('./components/Demo'))

export default function App() {
  const [data, setData] = useState<AppData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [theme, setThemeState] = useState<Theme>(() => (storageGet('llsn.theme') === 'light' ? 'light' : 'dark'))
  useEffect(() => applyTheme(theme), [theme])
  const setTheme = (t: Theme) => {
    storageSet('llsn.theme', t)
    setThemeState(t)
  }
  const fetchCore = useCallback(() => loadCore().then(setData, (e: Error) => setError(e.message)), [])
  useEffect(() => {
    void fetchCore()
  }, [fetchCore])
  if (error)
    return (
      <div className="boot">
        <div className="state-error" role="alert">
          <Icon name="warn" size={22} />
          <div>
            <p className="state-title">The mission data didn't load.</p>
            <p className="muted">{error}. Check your connection, then try again.</p>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setError(null)
                void fetchCore()
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  if (!data) return <BootSkeleton />
  return <Shell data={data} theme={theme} setTheme={setTheme} />
}

function BootSkeleton() {
  return (
    <div className="app" aria-busy="true" aria-label="Loading NASA ephemeris and terrain">
      <header className="topbar">
        <span className="brand">
          <Mark />
          <span>
            <span className="brand-name">LunaWindow</span>
            <span className="brand-tag">Loading JPL Horizons ephemeris and LOLA terrain…</span>
          </span>
        </span>
      </header>
      <div className="workspace">
        <aside className="rail">
          <Skeleton h={160} />
          <Skeleton h={140} />
        </aside>
        <section className="stage">
          <Skeleton h={56} w="60%" />
          <Skeleton h={240} r="var(--r-lg)" />
          <Skeleton h={240} />
        </section>
      </div>
    </div>
  )
}

function makeCustomSite(t: Terrain, lat: number, lon: number): Site {
  const lon360 = normalizeLon360(lon)
  const h = customHorizon(t, lat, lon360)
  return {
    id: `custom:${lat.toFixed(4)},${lon360.toFixed(4)}`,
    name: `Custom spot ${fmtLat(lat)}, ${fmtLon(lon360)}`,
    group: 'Custom',
    lat,
    lon: lon360,
    source: 'user input',
    verify: false,
    custom: true,
    elevationM: h.elevationM,
    horizon: h.mask,
    horizonDistKm: h.distKm,
    terrainNote: `Horizon computed in your browser from LOLA terrain at ${h.resolution} resolution (coarser than the listed sites).`,
  }
}

function parseCustomId(id: string): { la: number; lo: number } | null {
  if (!id.startsWith('custom:')) return null
  const [la, lo] = id.slice(7).split(',').map(Number)
  return Number.isFinite(la) && Number.isFinite(lo) ? { la, lo } : null
}

function Shell({ data, theme, setTheme }: { data: AppData; theme: Theme; setTheme: (t: Theme) => void }) {
  const first = useMemo(() => {
    const base: MissionState = window.location.hash
      ? fromHash(window.location.hash)
      : { ...DEFAULT_STATE, ws: storageGet('llsn.visited') ? 'compare' : 'home' }
    return clampToCoverage(base, data.eph.meta.startMs, data.eph.endMs)
  }, [data])
  const [s, setS] = useState<MissionState>(first.state)
  const [notice, setNotice] = useState<string | null>(first.note)
  const [custom, setCustom] = useState<Site[]>([])
  const [customBusy, setCustomBusy] = useState(false)
  const [finderRun, setFinderRun] = useState(0)
  const [summary, setSummary] = useState<SummaryContext | null>(null)
  const [demo, setDemo] = useState(false)
  const sites = useMemo(() => [...data.sites.sites, ...custom], [data, custom])

  useEffect(() => storageSet('llsn.visited', '1'), [])

  const set = useCallback((patch: Partial<MissionState>) => setS((cur) => ({ ...cur, ...patch })), [])

  const addCustom = useCallback(async (lat: number, lon: number, slot: 'A' | 'B') => {
    setCustomBusy(true)
    try {
      const terrain = await loadTerrain()
      const x = makeCustomSite(terrain, lat, lon)
      setCustom((c) => [...c.filter((y) => y.id !== x.id).slice(-5), x])
      setS((cur) => ({ ...cur, ...(slot === 'A' ? { siteA: x.id } : { siteB: x.id }) }))
    } finally {
      setCustomBusy(false)
    }
  }, [])

  // custom sites referenced by a shared link need terrain before they can be shown
  useEffect(() => {
    const ids = [s.siteA, s.siteB].filter((id) => id.startsWith('custom:') && !custom.some((c) => c.id === id))
    if (!ids.length) return
    loadTerrain().then(
      (terrain) => {
        const made = ids
          .map(parseCustomId)
          .filter((p): p is { la: number; lo: number } => p !== null)
          .map((p) => makeCustomSite(terrain, p.la, p.lo))
        setCustom((c) => [...c, ...made.filter((m) => !c.some((x) => x.id === m.id))])
      },
      () => setS((cur) => ({ ...cur, siteA: DEFAULT_STATE.siteA, siteB: DEFAULT_STATE.siteB })),
    )
  }, [s.siteA, s.siteB, custom])

  const site = useCallback(
    (id: string) => sites.find((x) => x.id === id) ?? data.sites.sites.find((x) => x.id === DEFAULT_STATE.siteA) ?? data.sites.sites[0],
    [sites, data],
  )
  const ready = ![s.siteA, s.siteB].some((id) => id.startsWith('custom:') && !custom.some((c) => c.id === id))

  // URL ← state
  useEffect(() => {
    const h = toHash(s)
    if (h !== window.location.hash) window.history.replaceState(null, '', h)
  }, [s])
  // state ← URL (edited or pasted links, back/forward)
  useEffect(() => {
    // read the URL from the event: a pending state commit may already have rewritten location.hash (replaceState),
    // which would silently undo an edited or pasted link
    const on = (e: HashChangeEvent) => {
      const r = clampToCoverage(fromHash(new URL(e.newURL).hash, s), data.eph.meta.startMs, data.eph.endMs)
      setS(r.state)
      setNotice(r.note)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [data, s])

  // Redesign: long explanatory notes are clamped to two lines; a click expands or collapses them (full text stays in the DOM)
  useEffect(() => {
    const on = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('a, button, input, select, label, summary')) return
      t.closest('.hint')?.classList.toggle('open')
    }
    document.addEventListener('click', on)
    return () => document.removeEventListener('click', on)
  }, [])

  // keyboard: ←/→ one hour, Shift+←/→ one day (Explore & Compare, Surface View; never while typing)
  useEffect(() => {
    if (s.ws !== 'compare' && s.ws !== 'surface') return
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el?.isContentEditable || el?.classList.contains('sv-view')) return
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
      e.preventDefault()
      const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? DAY : HOUR)
      setS((cur) => {
        const end = cur.missionStart + cur.durationDays * DAY - HOUR
        return { ...cur, selectedTime: Math.max(cur.missionStart, Math.min(end, cur.selectedTime + d)) }
      })
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [s.ws])

  // keep the selected time inside the mission whenever the period changes
  const missionEndMs = s.missionStart + s.durationDays * DAY - HOUR
  const clampedTime = Math.max(s.missionStart, Math.min(missionEndMs, s.selectedTime))
  const view: MissionState = clampedTime === s.selectedTime ? s : { ...s, selectedTime: clampedTime }

  const store: Store = {
    data,
    sites,
    s: view,
    set,
    site,
    addCustom,
    customBusy,
    theme,
    setTheme,
    notice,
    setNotice,
    finderRun,
    runFinder: () => setFinderRun((x) => x + 1),
    openSummary: setSummary,
    startDemo: () => setDemo(true),
  }
  const prefs = useMemo(() => ({ mode: s.mode, tz: s.tz }), [s.mode, s.tz])

  const label: Record<MissionState['ws'], string> = {
    home: 'The welcome screen',
    compare: 'Explore and Compare',
    finder: 'The Mission Window Finder',
    surface: 'Surface View',
    terrain: '3D terrain explorer',
    about: 'The methodology page',
  }

  return (
    <StoreContext.Provider value={store}>
      <PrefsContext.Provider value={prefs}>
        <div className={`app mode-${s.mode} ${s.full ? 'ui-full' : 'ui-simple'}`}>
          <a href="#view" className="skip">
            Skip to content
          </a>
          <LanePatterns />
          <Header />
          <main id="view" tabIndex={-1}>
            <GuideStrip ws={s.ws} />
            <ErrorBoundary key={s.ws} label={label[s.ws]}>
              <Suspense
                fallback={
                  <div className="pad">
                    <Skeleton h={420} />
                  </div>
                }
              >
                {!ready ? (
                  <div className="pad">
                    <Skeleton h={420} />
                  </div>
                ) : s.ws === 'home' ? (
                  <Welcome />
                ) : s.ws === 'compare' ? (
                  <ExploreCompare />
                ) : s.ws === 'finder' ? (
                  <MissionFinder />
                ) : s.ws === 'terrain' ? (
                  <TerrainExplorer />
                ) : s.ws === 'surface' ? (
                  <SurfaceView />
                ) : (
                  <div className="pad">
                    <About data={data} />
                  </div>
                )}
              </Suspense>
            </ErrorBoundary>
          </main>
          <footer className="foot">
            <p>
              LunaWindow, NASA Space Apps Challenge 2026. Built with free NASA data (JPL Horizons, LRO LOLA, LOLA polar illumination maps).
              Supported dates {fmtTime(data.eph.meta.startMs, 'utc', false)} to {fmtTime(data.eph.endMs, 'utc', false)}. A preliminary
              decision-support tool, not an official NASA product, and it does not certify landing safety.
            </p>
          </footer>
          <Suspense fallback={null}>
            {summary && <MissionSummary ctx={summary} onClose={() => setSummary(null)} />}
            {demo && <Demo onClose={() => setDemo(false)} />}
          </Suspense>
        </div>
      </PrefsContext.Provider>
    </StoreContext.Provider>
  )
}
