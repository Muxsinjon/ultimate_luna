import { useMemo } from 'react'
import { makeCtx, sampleAt } from '../lib/analysis'
import type { Site } from '../lib/data'
import { fmtAz, fmtDeg, fmtTime } from '../lib/format'
import { useStore } from '../lib/store'
import { polarXY } from '../lib/terrain'
import type { SurfacePoint, TerrainAsset } from '../lib/terrainMesh'
import type { IlluminationAsset } from '../lib/terrainShadow'
import { pointVisibility, RIGOROUS_EDGE_M, SHADOW_STRIDE, type LightingLayer, type LightingStats } from './lightingOverlay'

const pct = (v: number) => `${v.toFixed(1)} %`

/** Readout and disclaimers for the time-dependent terrain shadow / Earth line-of-sight layers. */
export default function LightingPanel({
  layer,
  onLayer,
  asset,
  illum,
  error,
  stats,
  point,
  site,
}: {
  layer: LightingLayer
  onLayer: (l: LightingLayer) => void
  asset: TerrainAsset
  illum: IlluminationAsset | null
  error: string
  stats: LightingStats | null
  point: SurfacePoint | null
  site: Site
}) {
  const { s, data } = useStore()
  const vertex = useMemo(() => {
    if (!point) return null
    const p = polarXY(point.lat, point.lon)
    const c = Math.round((p.x - asset.meta.x0) / asset.meta.dx),
      r = Math.round((p.y - asset.meta.y0) / asset.meta.dy)
    return r >= 0 && c >= 0 && r < asset.meta.height && c < asset.meta.width ? { r, c } : null
  }, [point, asset])
  const here = useMemo(
    () => (illum && vertex ? pointVisibility(asset, illum, vertex.r, vertex.c, data.eph, s.selectedTime) : null),
    [illum, vertex, asset, data, s.selectedTime],
  )
  const planner = useMemo(() => sampleAt(makeCtx(site, data.sites.azStepDeg), data.eph, s.selectedTime), [site, data, s.selectedTime])
  return (
    <section className="panel" aria-labelledby="lighting-heading">
      <h3 id="lighting-heading">Sunlight and Earth line of sight on this terrain</h3>
      <label className="field">
        Lighting layer
        <select aria-label="Lighting layer" value={layer} onChange={(e) => onLayer(e.target.value as LightingLayer)}>
          <option value="off">Off (use the analysis layer)</option>
          <option value="sunlight">Sunlight at the selected time (computed)</option>
          <option value="earth">Earth line of sight at the selected time (computed)</option>
          <option value="psr">Permanently shadowed regions (NASA PGDA, static context)</option>
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {!illum && !error && layer !== 'off' && <p role="status">Loading terrain horizon inputs…</p>}
      {stats && (
        <p
          className="num"
          data-testid="lighting-stats"
          data-sun-any={stats.innerSunAnyPct}
          data-sun-full={stats.innerSunFullPct}
          data-earth={stats.innerEarthPct}
        >
          At {fmtTime(stats.time, s.tz)}, inside the inner 6 × 6 km: any part of the Sun visible from {pct(stats.innerSunAnyPct)} of the
          surface, the full disc from {pct(stats.innerSunFullPct)}; Earth in line of sight from {pct(stats.innerEarthPct)}.
        </p>
      )}
      {layer === 'psr' && illum && (
        <p className="num" data-testid="psr-stats">
          {pct(100 * illum.meta.psrFraction)} of this 8 × 8 km crop is mapped as permanently shadowed (NASA PGDA product 90, 20 m). This is
          a static long-term map, not a prediction for the selected date.
        </p>
      )}
      {here && (
        <div data-testid="lighting-point" data-sun-frac={here.sunFrac} data-earth-frac={here.earthFrac} data-sun-horizon={here.sunHorizon}>
          <p className="num">
            Selected point at {fmtTime(s.selectedTime, s.tz)}: Sun {pct(100 * here.sunFrac)} of disc visible (elevation {fmtDeg(here.sunEl)}
            , terrain horizon toward azimuth {fmtAz(here.sunAz)}: {here.sunHorizon.toFixed(2)}°). Earth {pct(100 * here.earthFrac)} of disc
            in line of sight (elevation {fmtDeg(here.earthEl)}, horizon {here.earthHorizon.toFixed(2)}°).
            {here.psr === 1 ? ' Inside a mapped permanently shadowed region.' : ''}
          </p>
          {here.edgeM < RIGOROUS_EDGE_M && (
            <p className="hint">
              This point is within {RIGOROUS_EDGE_M} m of the crop edge: nearby outside terrain is only the 240 m regional DEM, so treat it
              as illustrative.
            </p>
          )}
        </div>
      )}
      <p className="hint">
        Site horizon at 240 m (planner): Sun {planner.sunHorizon.toFixed(2)}°, Earth {planner.earthHorizon.toFixed(2)}° at the same time.
        The 5 m-site layer adds nearby relief from the 20 m mesh, so the two can differ near ridges and crater rims.
      </p>
      <p className="hint">
        Method: for each surface point every {SHADOW_STRIDE * 20} m, the terrain horizon toward the Sun or Earth is the higher of the 20 m
        mesh inside the crop and the LOLA 240 m terrain outside it (to 250 km), seen from 2 m above the ground. A body counts as visible
        while its upper limb clears that horizon; partial discs are shown as the visible fraction. Compared with a native 5 m reference,
        horizon errors in the inner region are 0.01–0.04° median and up to about 0.7° (95th percentile), so near-horizon times can shift by
        an hour or more. Faded areas within {RIGOROUS_EDGE_M / 1000} km of the crop edge are illustrative only. Results use the
        hourly-resolution ephemeris; lighting on the mesh is otherwise for inspection.
      </p>
      <p className="hint">
        Earth line of sight is geometric visibility of Earth&apos;s disc. It is not a radio link budget and does not guarantee communication
        (antenna pointing, power, ground-station availability and relay coverage are not modelled).
      </p>
    </section>
  )
}
