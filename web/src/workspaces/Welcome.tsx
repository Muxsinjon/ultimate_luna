// Redesign: scroll story. A sticky 3D scene (real NASA imagery, real JPL Horizons geometry) with one short idea per screen.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { makeCtx, sampleAt } from '../lib/analysis'
import { fmtTime } from '../lib/format'
import { useStore } from '../lib/store'
import type { StoryFrame } from '../components/story/StoryScene'
import { H, storyTime, T0 } from '../lib/story'

const StoryScene = lazy(() => import('../components/story/StoryScene'))
const SITES = ['connecting-ridge', 'shackleton-rim-site04', 'nobile-rim-1-site06']

export default function Welcome() {
  const { set, site, startDemo, data } = useStore()
  const root = useRef<HTMLDivElement>(null)
  const frame = useRef<StoryFrame>({ p: 0, t: T0 })
  const [hour, setHour] = useState(T0)
  const reduced = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, [])
  const pins = useMemo(() => SITES.map((id) => site(id)).map((x) => ({ lat: x.lat, lon: x.lon })), [site])
  useEffect(() => {
    let raf = 0
    const on = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = root.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)))
        const t = storyTime(p)
        frame.current = { p, t }
        setHour(Math.floor(t / H) * H)
      })
    }
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', on)
    }
  }, [])
  const ridge = site('connecting-ridge')
  const now = useMemo(() => sampleAt(makeCtx(ridge, data.sites.azStepDeg), data.eph, hour), [ridge, data, hour])
  const go = (patch: Parameters<typeof set>[0]) => {
    set({ siteA: 'shackleton-rim-site04', siteB: 'nobile-rim-1-site06', ...patch })
    window.scrollTo({ top: 0 })
  }
  return (
    <div className="story" ref={root}>
      <Suspense fallback={<div className="story-canvas" />}>
        <StoryScene eph={data.eph} frame={frame} pins={pins} reduced={reduced} />
      </Suspense>
      <section className="story-step hero">
        <p className="story-kicker">LunaWindow</p>
        <h1>
          Launching to the Moon?
          <span>First, choose where to land.</span>
        </h1>
        <p className="story-lede">Scroll to see why the place and the time matter.</p>
        <button type="button" className="btn quiet" onClick={() => go({ ws: 'compare' })}>
          Skip to the tools
        </button>
      </section>
      <section className="story-step">
        <div className="story-card">
          <h2>Everyone wants the south pole</h2>
          <p>Some craters never see the Sun, so ice can survive there. Some ridges next to them are lit almost all the time.</p>
        </div>
      </section>
      <section className="story-step">
        <div className="story-card">
          <h2>Three real candidate sites</h2>
          <ul className="story-pins">
            {SITES.map((id) => (
              <li key={id}>{site(id).name.replace(/ \(.*\)/, '')}</li>
            ))}
          </ul>
          <p>Cyan dots: their true positions on NASA&apos;s lunar map.</p>
        </div>
      </section>
      <section className="story-step">
        <div className="story-card">
          <h2>The Sun skims the horizon</h2>
          <p>At the pole the Sun circles low in the sky. One hill can block it, and the lander loses power.</p>
          <p className="story-live num" aria-live="polite">
            {fmtTime(hour, 'utc')} · Sun at Connecting Ridge {now.sunEl.toFixed(1)}° · {now.sunFrac > 0 ? 'in sunlight' : 'in shadow'}
          </p>
        </div>
      </section>
      <section className="story-step">
        <div className="story-card">
          <h2>Earth rises and sets too</h2>
          <p>Earth wobbles in the lunar sky over a month. When it drops behind the terrain, the direct radio link is gone.</p>
          <p className="story-live num" aria-live="polite">
            {fmtTime(hour, 'utc')} · Earth {now.earthEl.toFixed(1)}° · {now.earthFrac > 0 ? 'in view' : 'hidden'}
          </p>
        </div>
      </section>
      <section className="story-step final">
        <h2>Pick a place and a time, and see why.</h2>
        <div className="story-actions">
          <button type="button" className="entry-card" onClick={() => go({ ws: 'compare' })}>
            <span className="entry-title">Explore landing sites</span>
            <span className="entry-text">Sunlight and Earth, hour by hour, for two sites.</span>
          </button>
          <button type="button" className="entry-card" onClick={() => go({ ws: 'finder' })}>
            <span className="entry-title">Find the best dates</span>
            <span className="entry-text">Set your needs; get ranked windows with reasons.</span>
          </button>
          <button type="button" className="entry-card" onClick={() => go({ ws: 'terrain' })}>
            <span className="entry-title">See the terrain in 3D</span>
            <span className="entry-text">NASA 5 m maps: slopes, hazards, shadows.</span>
          </button>
          <button type="button" className="entry-card" onClick={() => go({ ws: 'surface', surface3d: true, surfaceSite: 'B' })}>
            <span className="entry-title">Stand on the surface</span>
            <span className="entry-text">Walk around and watch the Sun and Earth move.</span>
          </button>
        </div>
        <button type="button" className="btn primary" onClick={startDemo}>
          Try the guided demo
        </button>
        <p className="story-credit">
          Imagery: NASA LRO (Moon), Blue Marble (Earth), SDO (Sun), Hipparcos/Tycho star map. Directions and lighting from JPL Horizons;
          distances compressed to fit. Not a NASA product.
        </p>
      </section>
    </div>
  )
}
