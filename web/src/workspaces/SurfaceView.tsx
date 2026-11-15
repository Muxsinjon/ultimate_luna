import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { loadTerrainIndex, terrainSiteFor, type TerrainIndex } from '../lib/terrainMesh'
import { type Sample, SUN_RADIUS_DEG, makeCtx, sampleAt, vectorsAt } from '../lib/analysis'
import { fmtAz, fmtDeg, fmtPct, fmtTime } from '../lib/format'
import { horizonAt } from '../lib/geometry'
import { earthPhase } from '../lib/physics/earthPhase'
import { useStore } from '../lib/store'
import { MODEL_LABEL, signal } from '../lib/visibility'
import { reason } from '../lib/explain'
import { SiteFacts } from '../components/SitePair'
import TimeBar from '../components/TimeBar'
import { Chip, useWidth } from '../components/ui'

const SurfaceFirstPerson = lazy(() => import('../components/SurfaceFirstPerson'))

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180

export default function SurfaceView() {
  const { s, set, site, data } = useStore()
  const st = site(s.surfaceSite === 'A' ? s.siteA : s.siteB)
  const ctx = useMemo(() => makeCtx(st, data.sites.azStepDeg), [st, data])
  const [terrainIdx, setTerrainIdx] = useState<TerrainIndex | null>(null)
  useEffect(() => {
    let live = true
    loadTerrainIndex().then(
      (i) => live && setTerrainIdx(i),
      () => undefined, // without the index the panorama remains fully functional
    )
    return () => {
      live = false
    }
  }, [])
  const terrainIndexed = terrainIdx !== null
  const terrainInfo = terrainIdx ? terrainSiteFor(terrainIdx.sites, st.id, st.lat, st.lon) : null
  const show3d = s.surface3d && !!terrainInfo
  const now = useMemo(() => sampleAt(ctx, data.eph, s.selectedTime), [ctx, data, s.selectedTime])
  const [view, setView] = useState({ az: now.sunAz, el: 5 })
  const [fov, setFov] = useState(90)
  const [ex, setEx] = useState(1)
  const [box, W] = useWidth<HTMLDivElement>()
  const H = Math.round(Math.max(320, Math.min(520, W * 0.5)))
  const drag = useRef<{ x: number; y: number; az: number; el: number } | null>(null)

  const pxPerDeg = W / fov
  const pxV = pxPerDeg * ex
  const X = (az: number) => W / 2 + wrap180(az - view.az) * pxPerDeg
  const Y = (el: number) => H / 2 - (el - view.el) * pxV
  const terrainMode = s.vis === 'terrain'

  // terrain silhouette across the visible azimuths (sampled every 0.5°)
  const ground = useMemo(() => {
    const pts: string[] = []
    const half = fov / 2 + 1
    for (let d = -half; d <= half; d += 0.5) {
      const az = view.az + d
      const hz = horizonAt(st.horizon, data.sites.azStepDeg, az)
      pts.push(`${(W / 2 + d * pxPerDeg).toFixed(1)},${Y(hz).toFixed(1)}`)
    }
    return pts
    // Y depends on view/ex/H
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, view, fov, W, H, ex, data])

  // Earth phase as seen from this site (pure function, validated against JPL Horizons Illu%)
  const earthPhaseNow = useMemo(() => {
    const { earth, sun } = vectorsAt(data.eph, s.selectedTime)
    const fromSite: [number, number, number] = [earth[0] - ctx.pos[0], earth[1] - ctx.pos[1], earth[2] - ctx.pos[2]]
    return earthPhase(fromSite, sun, earth, data.eph.meta.meanSunDistanceKm)
  }, [data, s.selectedTime, ctx])

  const sunR = Math.max(4, SUN_RADIUS_DEG * pxPerDeg)
  const earthR = Math.max(5, now.earthRadiusDeg * pxPerDeg)
  const sunVis = signal(now, 'sun', s.vis) > 0
  const earthVis = signal(now, 'earth', s.vis) > 0
  const sx = X(now.sunAz)
  const sy = Y(now.sunEl)
  const exx = X(now.earthAz)
  const ey = Y(now.earthEl)
  const toSun = Math.atan2(sy - ey, sx - exx) // screen direction from Earth towards the Sun
  const r = earthR
  const rx = r * Math.abs(Math.cos(earthPhaseNow.phaseAngle))
  const gibbous = earthPhaseNow.phaseAngle < Math.PI / 2
  const litPath = `M0,${-r} A${r},${r} 0 0 1 0,${r} A${rx},${r} 0 0 ${gibbous ? 1 : 0} 0,${-r}Z`

  const look = (az: number, el: number) => setView({ az, el: Math.max(-10, Math.min(60, el)) })

  const ticks: number[] = []
  for (let a = Math.ceil((view.az - fov / 2) / 5) * 5; a <= view.az + fov / 2; a += 5) ticks.push(a)

  const summary = `${st.name} at ${fmtTime(s.selectedTime, s.tz)}, looking towards azimuth ${fmtAz(view.az)}. ${reason(now, 'sun', s.vis)} ${reason(now, 'earth', s.vis)}`

  return (
    <div className="workspace surface-ws">
      <section className="stage wide" aria-labelledby="sv-title">
        <div className="stage-head">
          <div>
            <h2 id="sv-title">Surface view</h2>
            <p className="lede">What an observer 2 m above the ground would see, using the same calculated angles as the charts.</p>
            <p className="model-label">{MODEL_LABEL[s.vis]}</p>
          </div>
          <div className="actions">
            <div className="seg" role="radiogroup" aria-label="Site shown">
              {(['A', 'B'] as const).map((x) => (
                <button
                  key={x}
                  type="button"
                  role="radio"
                  aria-checked={s.surfaceSite === x}
                  className={s.surfaceSite === x ? 'on' : ''}
                  onClick={() => set({ surfaceSite: x })}
                >
                  Site {x}
                </button>
              ))}
            </div>
            <button type="button" className="btn" onClick={() => set({ ws: 'compare' })}>
              Back to Explore and Compare
            </button>
          </div>
        </div>
        <SiteFacts site={st} slot={s.surfaceSite} />
        <button className="btn" type="button" onClick={() => set({ ws: 'terrain' })}>
          Open 3D terrain explorer
        </button>
        <TimeBar />

        <div className="seg" role="radiogroup" aria-label="Surface view mode">
          <button
            type="button"
            role="radio"
            aria-checked={!show3d}
            className={!show3d ? 'on' : ''}
            onClick={() => set({ surface3d: false })}
          >
            360° horizon panorama
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={show3d}
            className={show3d ? 'on' : ''}
            disabled={!terrainInfo}
            onClick={() => set({ surface3d: true })}
          >
            3D first person (5 m terrain)
          </button>
        </div>
        {!terrainInfo && terrainIndexed && (
          <p className="hint" data-testid="fp-unavailable">
            No processed NASA 5 m terrain covers {st.name}, so the 3D first-person view is not available here. This 360° panorama uses the
            LOLA {st.lat <= -75 ? '240 m' : 'regional'} horizon; no terrain detail is invented.
          </p>
        )}
        {show3d && terrainInfo ? (
          <Suspense fallback={<p role="status">Loading the first-person view…</p>}>
            <SurfaceFirstPerson site={st} slot={s.surfaceSite} info={terrainInfo} />
          </Suspense>
        ) : (
          <>
            <div className="sv-tools">
              <button type="button" className="btn" onClick={() => look(now.sunAz, now.sunEl)}>
                Look at the Sun
              </button>
              <button type="button" className="btn" onClick={() => look(now.earthAz, now.earthEl)}>
                Look at Earth
              </button>
              <label className="field inline">
                <span className="field-label">Field of view</span>
                <select value={fov} onChange={(e) => setFov(+e.target.value)}>
                  {[30, 60, 90, 120, 180].map((f) => (
                    <option key={f} value={f}>
                      {f}°
                    </option>
                  ))}
                </select>
              </label>
              <label className="field inline">
                <span className="field-label">Vertical scale</span>
                <select value={ex} onChange={(e) => setEx(+e.target.value)}>
                  <option value={1}>True angles (1×)</option>
                  <option value={3}>Exaggerated 3×</option>
                  <option value={6}>Exaggerated 6×</option>
                </select>
              </label>
            </div>

            <figure className="sv-frame">
              <div className="sv-compass num" aria-hidden>
                {ticks.map((a) => {
                  const n = ((a % 360) + 360) % 360
                  const major = n % 45 === 0
                  return (
                    <span key={a} className={major ? 'major' : ''} style={{ left: `${(((a - view.az) / fov) * 100 + 50).toFixed(2)}%` }}>
                      {major ? COMPASS[n / 45] : n % 15 === 0 ? `${n}°` : ''}
                    </span>
                  )
                })}
                <span className="sv-center" />
              </div>
              <div
                ref={box}
                className="sv-view"
                tabIndex={0}
                role="img"
                aria-label={summary}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId)
                  drag.current = { x: e.clientX, y: e.clientY, az: view.az, el: view.el }
                }}
                onPointerMove={(e) => {
                  if (!drag.current) return
                  const d = drag.current
                  const az = d.az - (e.clientX - d.x) / pxPerDeg
                  const el = d.el + (e.clientY - d.y) / pxV
                  setView({ az: ((az % 360) + 360) % 360, el: Math.max(-10, Math.min(60, el)) })
                }}
                onPointerUp={() => (drag.current = null)}
                onKeyDown={(e) => {
                  const k: Record<string, [number, number]> = { a: [-5, 0], d: [5, 0], w: [0, 2], s: [0, -2] }
                  const m = k[e.key.toLowerCase()]
                  if (m) look(view.az + m[0], view.el + m[1])
                }}
              >
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
                  <rect width={W} height={H} className="sv-sky" />
                  {/* Sun and Earth first, so terrain in front can hide them */}
                  <g className={sunVis ? '' : 'sv-hidden'}>
                    <circle cx={sx} cy={sy} r={sunR} className="sv-sun" />
                  </g>
                  <g transform={`translate(${exx},${ey}) rotate(${(toSun * 180) / Math.PI})`} className={earthVis ? '' : 'sv-hidden'}>
                    <circle r={r} className="sv-earth-dark" />
                    <path d={litPath} className="sv-earth-lit" />
                  </g>
                  {terrainMode ? (
                    <path d={`M0,${H} L${ground.join(' L')} L${W},${H} Z`} className="sv-ground" />
                  ) : (
                    <>
                      <rect x={0} y={Y(0)} width={W} height={Math.max(0, H - Y(0))} className="sv-ground flat" />
                      <polyline points={ground.join(' ')} className="sv-terrain-ghost" />
                    </>
                  )}
                  <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} className="sv-zero" />
                  {!sunVis && <circle cx={sx} cy={sy} r={sunR} className="sv-wire sun" />}
                  {!earthVis && <circle cx={exx} cy={ey} r={r} className="sv-wire earth" />}
                  <text x={sx + sunR + 6} y={sy - sunR - 2} className="sv-label sun">
                    Sun{sunVis ? '' : ' (hidden)'}
                  </text>
                  <text x={exx + r + 6} y={ey + 4} className="sv-label earth">
                    Earth{earthVis ? '' : ' (hidden)'}
                  </text>
                  <text x={8} y={Y(0) - 6} className="sv-note">
                    0° geometric horizon
                  </text>
                  {!terrainMode && (
                    <text x={8} y={18} className="sv-note">
                      Dotted line: real LOLA terrain, ignored by the geometric model
                    </text>
                  )}
                  {ex !== 1 && (
                    <text x={W - 8} y={18} textAnchor="end" className="sv-note warn">
                      Vertical scale exaggerated {ex}×
                    </text>
                  )}
                </svg>
              </div>
              <Overview
                horizon={st.horizon}
                step={data.sites.azStepDeg}
                now={now}
                viewAz={view.az}
                fov={fov}
                onPick={(az) => look(az, view.el)}
              />
              <figcaption>
                Drag to look around (or focus the view and use W, A, S, D). The sky is black because the Moon has no atmosphere. Hidden
                bodies are drawn as outlines only. Earth’s phase is computed from the Sun–Earth geometry.
              </figcaption>
            </figure>

            <div className="sv-readout">
              <section className="tile">
                <div className="tile-label">Sun</div>
                <div className="chips">
                  {sunVis ? (
                    <Chip kind="sun">{terrainMode && now.sunFrac < 0.999 ? `Sunlit, ${fmtPct(now.sunFrac * 100)} of disc` : 'Sunlit'}</Chip>
                  ) : (
                    <Chip kind="none" icon="sun">
                      Dark
                    </Chip>
                  )}
                </div>
                <p className="num">
                  Azimuth {fmtAz(now.sunAz)}, elevation {fmtDeg(now.sunEl)}
                  {terrainMode && `, terrain ${fmtDeg(now.sunHorizon)}`}
                </p>
                <p className="reason">{reason(now, 'sun', s.vis)}</p>
              </section>
              <section className="tile">
                <div className="tile-label">Earth</div>
                <div className="chips">
                  {earthVis ? (
                    <Chip kind="earth">Earth link ✓</Chip>
                  ) : (
                    <Chip kind="none" icon="earth">
                      No Earth link
                    </Chip>
                  )}
                </div>
                <p className="num">
                  Azimuth {fmtAz(now.earthAz)}, elevation {fmtDeg(now.earthEl)}
                  {terrainMode && `, terrain ${fmtDeg(now.earthHorizon)}`}, {fmtPct(earthPhaseNow.illuminated * 100)} of Earth’s disc sunlit
                  (phase angle {fmtDeg((earthPhaseNow.phaseAngle * 180) / Math.PI)}), apparent diameter{' '}
                  {(2 * now.earthRadiusDeg).toFixed(2)}°, distance {Math.round(now.earthDistKm).toLocaleString('en')} km
                </p>
                <p className="reason">{reason(now, 'earth', s.vis)}</p>
              </section>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

/** 360° strip: orientation indicator with the current viewing window; select to turn there. */
function Overview({
  horizon,
  step,
  now,
  viewAz,
  fov,
  onPick,
}: {
  horizon: number[]
  step: number
  now: Sample
  viewAz: number
  fov: number
  onPick: (az: number) => void
}) {
  const [box, W] = useWidth<HTMLDivElement>()
  const H = 56
  const lo = -5
  const hi = Math.max(10, ...horizon.map((h) => h + 1))
  const x = (az: number) => ((((az % 360) + 360) % 360) / 360) * W
  const y = (el: number) => H - ((Math.max(lo, Math.min(hi, el)) - lo) / (hi - lo)) * H
  const pts = horizon.map((h, i) => `${x(i * step).toFixed(1)},${y(h).toFixed(1)}`)
  const v0 = x(viewAz - fov / 2)
  const vw = (fov / 360) * W
  return (
    <div ref={box} className="sv-overview">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`360-degree overview. Viewing towards azimuth ${fmtAz(viewAz)}.`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          onPick(((e.clientX - r.left) / r.width) * 360)
        }}
      >
        <rect width={W} height={H} className="sv-sky" />
        <path d={`M0,${H} L${pts.join(' L')} L${W},${y(horizon[0])} L${W},${H}Z`} className="sv-ground" />
        <rect x={v0} y={1} width={vw} height={H - 2} className="sv-window" />
        {v0 < 0 && <rect x={W + v0} y={1} width={-v0} height={H - 2} className="sv-window" />}
        {v0 + vw > W && <rect x={0} y={1} width={v0 + vw - W} height={H - 2} className="sv-window" />}
        <circle cx={x(now.sunAz)} cy={y(now.sunEl)} r={4} className="sv-sun" />
        <circle cx={x(now.earthAz)} cy={y(now.earthEl)} r={4} className="sv-earth-lit" />
        {['N', 'E', 'S', 'W'].map((c, i) => (
          <text key={c} x={x(i * 90) + 3} y={11} className="sv-note">
            {c}
          </text>
        ))}
      </svg>
    </div>
  )
}
