// Milestone 7: Surface View 3D first-person mode on the processed 5 m sites (falls back to the 360° panorama).
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { bodyVectorsFromSite, makeCtx, sampleAt, vectorsAt } from '../lib/analysis'
import type { Site } from '../lib/data'
import { azElFromLocal, cameraFrame, DEFAULT_EYE_M, horizonProfile, nearestVertex, walk } from '../lib/firstPerson'
import { fmtAz, fmtDeg, fmtTime } from '../lib/format'
import { DEFAULT_HAZARD_SETTINGS, useHazardTexture } from './hazardTexture'
import { angularRadiusDeg, R_EARTH_KM, SUN_RADIUS_DEG } from '../lib/physics/disc'
import { useStore } from '../lib/store'
import { loadSiteLayers } from '../lib/terrainCache'
import { bodyDirectionToLocal, type TerrainAsset, type TerrainSiteInfo } from '../lib/terrainMesh'
import type { HazardData } from '../lib/hazardAnalysis'
import { farHorizon, illuminationField, vertexVisibility } from '../lib/terrainShadow'
import { useSiteIllumination } from './lightingOverlay'
import { MODEL_LABEL } from '../lib/visibility'

const FirstPersonView = lazy(() => import('./FirstPersonView'))
const pct = (v: number) => `${(100 * v).toFixed(0)} %`
type Overlay = 'sunlight' | 'hazard' | 'none'

export default function SurfaceFirstPerson({ site, slot, info }: { site: Site; slot: 'A' | 'B'; info: TerrainSiteInfo }) {
  const { s, set, data, theme } = useStore()
  const [layers, setLayers] = useState<{ id: string; asset: TerrainAsset; hazards: HazardData } | null>(null)
  const [error, setError] = useState('')
  const illum = useSiteIllumination(info.id)
  const [pos, setPos] = useState<{ key: string; lat: number; lon: number } | null>(null)
  const [eye, setEye] = useState(DEFAULT_EYE_M)
  const [view, setView] = useState({ az: 0, el: 2 })
  const [fov, setFov] = useState(70)
  const [overlay, setOverlay] = useState<Overlay>('sunlight')
  useEffect(() => {
    let live = true
    loadSiteLayers(info.id).then(
      (l) => live && setLayers({ id: info.id, ...l }),
      (e: Error) => live && setError(e.message),
    )
    return () => {
      live = false
    }
  }, [info.id])
  const asset = layers && layers.id === info.id ? layers.asset : null
  const key = `${info.id}:${site.id}`
  const here = pos && pos.key === key ? pos : { key, lat: site.lat, lon: site.lon }
  const frame = useMemo(() => (asset ? cameraFrame(asset, here.lat, here.lon, eye) : null), [asset, here.lat, here.lon, eye])
  const far = illum?.data?.far ?? null
  const vtx = useMemo(() => (asset ? nearestVertex(asset, here.lat, here.lon) : null), [asset, here.lat, here.lon])
  const vecs = useMemo(
    () => (frame ? bodyVectorsFromSite(data.eph, s.selectedTime, here.lat, here.lon, frame.groundM + eye) : null),
    [frame, data, s.selectedTime, here.lat, here.lon, eye],
  )
  const bodies = useMemo(() => {
    if (!vecs || !asset) return null
    const o = asset.meta.origin
    return {
      sun: bodyDirectionToLocal(vecs.sun, o),
      earth: bodyDirectionToLocal(vecs.earth, o),
      sunRadiusDeg: SUN_RADIUS_DEG,
      earthRadiusDeg: angularRadiusDeg(R_EARTH_KM, Math.hypot(...vecs.earth)),
    }
  }, [vecs, asset])
  const dirs = useMemo(
    () => (frame && bodies ? { sun: azElFromLocal(frame, bodies.sun), earth: azElFromLocal(frame, bodies.earth) } : null),
    [frame, bodies],
  )
  const moon = useMemo(() => vectorsAt(data.eph, s.selectedTime), [data, s.selectedTime])
  // computed visibility at the nearest mesh vertex (Milestone 5 algorithm; observer 2 m above the ground)
  const visFixed = useMemo(
    () => (asset && far && vtx ? vertexVisibility(asset, far, vtx.r, vtx.c, moon.sun, moon.earth) : null),
    [asset, far, vtx, moon],
  )
  const farAt = useMemo(() => (asset && far && vtx ? (az: number) => farHorizon(asset, far, vtx.r, vtx.c, az) : null), [asset, far, vtx])
  // computed sunlit fraction (Milestone 5 algorithm, every 80 m) as a brightness map; floor keeps shadows faintly visible
  const shade = useMemo(() => {
    if (overlay !== 'sunlight' || !asset || !far) return null
    const f = illuminationField(asset, far, moon.sun, moon.earth, 4)
    const c = document.createElement('canvas')
    c.width = c.height = f.size
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(f.size, f.size)
    for (let i = 0; i < f.sun.length; i++) {
      const v = Math.round(255 * (0.04 + 0.96 * f.sun[i]))
      img.data.set([v, v, v, 255], i * 4)
    }
    ctx.putImageData(img, 0, 0)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.repeat.set((f.size - 1) / f.size, (f.size - 1) / f.size)
    t.offset.set(0.5 / f.size, 0.5 / f.size)
    return t
  }, [overlay, asset, far, moon])
  useEffect(() => () => shade?.dispose(), [shade])
  const hazardTex = useHazardTexture(
    overlay === 'hazard' && layers?.id === info.id ? layers.hazards : null,
    'hazard',
    { slope: DEFAULT_HAZARD_SETTINGS.maxSlope, roughness: DEFAULT_HAZARD_SETTINGS.maxRough },
    theme,
  )
  const profile = useMemo(() => (asset && far && vtx ? horizonProfile(asset, far, vtx.r, vtx.c, 2) : null), [asset, far, vtx])
  const planner = useMemo(() => sampleAt(makeCtx(site, data.sites.azStepDeg), data.eph, s.selectedTime), [site, data, s.selectedTime])

  if (error) return <p role="alert">{error}</p>
  if (!asset || !frame || !bodies || !dirs) return <p role="status">Loading verified 5 m terrain for the first-person view…</p>
  const moved = here.lat !== site.lat || here.lon !== site.lon
  const doWalk = (az: number, m: number) => {
    const p = walk(asset, frame, az, m)
    if (p) setPos({ key, lat: p.lat, lon: p.lon })
  }
  return (
    <section aria-labelledby="fp-h" className="fp">
      <h3 id="fp-h">
        First-person view at Site {slot}: {site.name}
      </h3>
      <p className="model-label">
        NASA PGDA {info.product} 5 m DEM as a 20 m mesh; terrain beyond the 8 × 8 km crop from LOLA 240 m (silhouette).{' '}
        {MODEL_LABEL.terrain}.
      </p>
      <div className="sv-tools">
        <button type="button" className="btn" onClick={() => setView({ az: dirs.sun.az, el: dirs.sun.el })}>
          Look at the Sun
        </button>
        <button type="button" className="btn" onClick={() => setView({ az: dirs.earth.az, el: dirs.earth.el })}>
          Look at Earth
        </button>
        <button type="button" className="btn" onClick={() => setView({ az: 0, el: 2 })}>
          Look north
        </button>
        <label className="field inline">
          <span className="field-label">Field of view</span>
          <select aria-label="First-person field of view" value={Math.round(fov)} onChange={(e) => setFov(+e.target.value)}>
            {[30, 50, 70, 90].includes(Math.round(fov)) ? null : <option value={Math.round(fov)}>{Math.round(fov)}°</option>}
            {[30, 50, 70, 90].map((f) => (
              <option key={f} value={f}>
                {f}°
              </option>
            ))}
          </select>
        </label>
        <label className="field inline">
          <span className="field-label">Eye height above local terrain</span>
          <select aria-label="Eye height above local terrain" value={eye} onChange={(e) => setEye(+e.target.value)}>
            <option value={1.7}>1.7 m (standing astronaut)</option>
            <option value={2}>2 m (planner observer)</option>
            <option value={10}>10 m (mast)</option>
            <option value={100}>100 m (overview)</option>
          </select>
        </label>
        <label className="field inline">
          <span className="field-label">Surface overlay</span>
          <select aria-label="Surface overlay" value={overlay} onChange={(e) => setOverlay(e.target.value as Overlay)}>
            <option value="sunlight">Computed sunlight and shadow</option>
            <option value="hazard">Hazard spots (10°, 0.3 m, illustrative)</option>
            <option value="none">Plain terrain (sun-angle shading only)</option>
          </select>
        </label>
      </div>
      <Suspense fallback={<p role="status">Loading 3D view…</p>}>
        <FirstPersonView
          asset={asset}
          frame={frame}
          far={far}
          farAt={farAt}
          bodies={bodies}
          shade={overlay === 'hazard' ? hazardTex : shade}
          view={view}
          fov={fov}
          theme={theme}
          onView={setView}
          onFov={setFov}
          onWalk={doWalk}
          sunMoonME={moon.sun}
          timeMs={s.selectedTime}
        />
      </Suspense>
      <div className="fp-compass num" aria-live="polite" data-testid="fp-heading" data-az={view.az} data-el={view.el}>
        Looking toward {fmtAz(view.az)} ({['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(view.az / 45) % 8]}), {fmtDeg(view.el)}{' '}
        above the local horizontal; field of view {Math.round(fov)}°.
      </div>
      <p className="hint">
        Drag to look around, wheel to zoom, arrow keys to look, W A S D to walk (5 m; Shift for 50 m) within 200 m of the crop edge.
        Position: {here.lat.toFixed(5)}° latitude, {here.lon.toFixed(5)}° E, ground {frame.groundM.toFixed(1)} m, eye {eye} m above it.
        {moved && (
          <>
            {' '}
            <button type="button" className="btn quiet" onClick={() => setPos(null)}>
              Return to the site location
            </button>
          </>
        )}
      </p>
      <div
        className="panel"
        data-testid="fp-sky"
        data-sun-az={dirs.sun.az}
        data-sun-el={dirs.sun.el}
        data-earth-az={dirs.earth.az}
        data-earth-el={dirs.earth.el}
        data-sun-frac={visFixed?.sunFrac}
        data-earth-frac={visFixed?.earthFrac}
      >
        <p className="num">
          At {fmtTime(s.selectedTime, s.tz)}: Sun azimuth {fmtAz(dirs.sun.az)}, elevation {fmtDeg(dirs.sun.el)}, apparent diameter{' '}
          {(2 * bodies.sunRadiusDeg).toFixed(2)}°. Earth azimuth {fmtAz(dirs.earth.az)}, elevation {fmtDeg(dirs.earth.el)}, apparent
          diameter {(2 * bodies.earthRadiusDeg).toFixed(2)}° (phase from the Sun direction).
        </p>
        {visFixed ? (
          <p className="num">
            Computed at this spot (5 m-site horizon, 2 m observer): Sun {pct(visFixed.sunFrac)} of disc visible, Earth{' '}
            {pct(visFixed.earthFrac)} of disc in line of sight. Planner (240 m horizon) at the site location: Sun {pct(planner.sunFrac)},
            Earth {pct(planner.earthFrac)}.
          </p>
        ) : illum?.error ? (
          <p role="alert">
            Horizon inputs could not be loaded ({illum.error}). The view shows the 5 m terrain without the far-terrain silhouette or
            computed shadows; use the 360° panorama for visibility.
          </p>
        ) : (
          <p role="status">Loading horizon inputs…</p>
        )}
        {profile && dirs && (
          <HorizonProfile profile={profile} plannerMask={site.horizon} plannerStep={data.sites.azStepDeg} dirs={dirs} heading={view.az} />
        )}
      </div>
      <details className="panel">
        <summary>Realism limits of this view</summary>
        <ul className="small">
          <li>
            Terrain is the NASA 5 m DEM decimated to a 20 m mesh (about 90 % of source pixels are interpolated); features smaller than about
            20–40 m, boulders and small craters are not shown. Beyond the 8 km crop only a 240 m silhouette is drawn; nothing is invented.
          </li>
          <li>
            Shadows are the Milestone 5 horizon calculation every 80 m (not a rendered shadow map); brightness is not photometric, and the
            faint fill light on shadowed ground is a display aid, not earthshine or scattered light.
          </li>
          <li>
            No surface imagery: LROC WAC registration is unverified, so it is not draped here. Black sky: the Moon has no atmosphere, haze
            or refraction. No dust, regolith physics or lander lighting.
          </li>
          <li>
            Sun and Earth are drawn at their true angular sizes; Earth&apos;s phase comes from lighting a sphere from the Sun direction.
          </li>
        </ul>
      </details>
      <div className="actions">
        <button type="button" className="btn" onClick={() => set({ surface3d: false })}>
          Back to the 360° panorama
        </button>
        <button type="button" className="btn" onClick={() => set({ ws: 'terrain', surfaceSite: slot })}>
          Open the 3D terrain map
        </button>
      </div>
    </section>
  )
}

function HorizonProfile({
  profile,
  plannerMask,
  plannerStep,
  dirs,
  heading,
}: {
  profile: ReturnType<typeof horizonProfile>
  plannerMask: number[]
  plannerStep: number
  dirs: { sun: { az: number; el: number }; earth: { az: number; el: number } }
  heading: number
}) {
  const W = 720,
    Hh = 120
  const lo = -5,
    hi = Math.max(10, ...profile.combined, dirs.sun.el + 2, dirs.earth.el + 2)
  const X = (az: number) => (az / 360) * W
  const Y = (el: number) => Hh - ((el - lo) / (hi - lo)) * Hh
  const line = (az: number[], el: number[]) => az.map((a, i) => `${i ? 'L' : 'M'}${X(a).toFixed(1)},${Y(el[i]).toFixed(1)}`).join('')
  const pAz = plannerMask.map((_, i) => i * plannerStep)
  return (
    <figure data-testid="horizon-profile">
      <svg
        viewBox={`0 0 ${W} ${Hh}`}
        className="fp-profile"
        role="img"
        aria-label="Horizon profile at this spot: 5 m-site horizon, planner 240 m horizon, Sun and Earth positions"
      >
        <path d={line(profile.az, profile.combined)} className="fp-h-site" />
        <path d={line(pAz, plannerMask)} className="fp-h-planner" />
        <line x1={X(heading)} x2={X(heading)} y1={0} y2={Hh} className="fp-h-heading" />
        <circle cx={X(dirs.sun.az)} cy={Y(dirs.sun.el)} r={4} className="fp-h-sun" />
        <circle cx={X(dirs.earth.az)} cy={Y(dirs.earth.el)} r={4} className="fp-h-earth" />
      </svg>
      <figcaption className="small">
        Horizon from azimuth 0° (N) to 360°, {lo}° to {hi.toFixed(0)}° elevation: solid line 5 m-site horizon at this spot, dashed line
        planner 240 m horizon at the site location, orange Sun, blue Earth, vertical line current heading.
      </figcaption>
    </figure>
  )
}
