import { useEffect, useMemo, useState } from 'react'
import { type Criteria, type HazardData } from '../lib/hazardAnalysis'
import { loadSiteLayers } from '../lib/terrainCache'
import { footprintDetail, type FootprintDetail } from '../lib/terrainCompare'
import { sampleGrid, type SurfacePoint, type TerrainAsset, type TerrainSiteInfo } from '../lib/terrainMesh'
import { hazardAligned, useHazardTexture, type HazardSettings } from './hazardTexture'
import TerrainCanvas, { type CameraLink } from './TerrainCanvas'
import { useLightingOverlay, useSiteIllumination, type LightingLayer } from './lightingOverlay'
import { bodyVectorsFromSite } from '../lib/analysis'
import { useStore } from '../lib/store'

export interface PaneResult {
  siteId: string
  detail: FootprintDetail | null
}

/** One side of the dual 3D comparison. Mount with `key={info.id}` so no value survives a site switch. */
export default function TerrainComparePane({
  slot,
  lighting = 'off',
  info,
  centre,
  settings,
  theme,
  link,
  linked,
  onResult,
}: {
  slot: 'A' | 'B'
  info: TerrainSiteInfo
  /** planner site location used as the default footprint centre */
  centre: { lat: number; lon: number }
  settings: HazardSettings
  lighting?: LightingLayer
  theme: string
  link: CameraLink
  linked: boolean
  onResult: (slot: 'A' | 'B', r: PaneResult | null) => void
}) {
  const [asset, setAsset] = useState<TerrainAsset | null>(null),
    [hz, setHz] = useState<HazardData | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [picked, setPicked] = useState<SurfacePoint | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    loadSiteLayers(info.id)
      .then(({ asset: a, hazards: h }) => {
        if (abort.signal.aborted) return
        if (!hazardAligned(h, a)) throw new Error('Scientific layer does not align with elevation source')
        setAsset(a)
        setHz(h)
      })
      .catch((e: Error) => {
        if (!abort.signal.aborted) setError(e.message)
      })
    return () => abort.abort()
  }, [info.id, attempt])
  const siteElevation = asset ? sampleGrid(asset, centre.lat, centre.lon) : null
  const site = useMemo(
    () => (siteElevation === null ? null : { lat: centre.lat, lon: centre.lon, elevationM: siteElevation }),
    [centre.lat, centre.lon, siteElevation],
  )
  const { s, data } = useStore()
  const bodies = useMemo(
    () => (site ? bodyVectorsFromSite(data.eph, s.selectedTime, site.lat, site.lon, site.elevationM) : null),
    [site, data, s.selectedTime],
  )
  const focus = picked ?? site
  const criteria = useMemo<Criteria>(
    () => ({ slope: settings.maxSlope, roughness: settings.maxRough }),
    [settings.maxSlope, settings.maxRough],
  )
  const detail = useMemo(
    () => (hz && asset && focus ? footprintDetail(hz, asset, focus, focus.elevationM, settings.radius, criteria) : null),
    [hz, asset, focus, settings.radius, criteria],
  )
  useEffect(() => {
    onResult(slot, hz && asset ? { siteId: info.id, detail } : null)
  }, [slot, info.id, hz, asset, detail, onResult])
  useEffect(() => () => onResult(slot, null), [slot, onResult])
  const texture = useHazardTexture(hz, settings.layer, criteria, theme)
  const illum = useSiteIllumination(lighting === 'off' ? null : info.id)
  const light = useLightingOverlay(asset, illum?.data ?? null, lighting, data.eph, s.selectedTime, theme)
  const visual = useMemo(
    () => ({
      texture: lighting !== 'off' ? light.texture : texture,
      layer: lighting !== 'off' ? lighting : settings.layer,
      footprint: focus && detail ? { point: focus, radius: detail.projectedRadiusM } : null,
    }),
    [texture, light.texture, lighting, settings.layer, focus, detail],
  )
  return (
    <section className="panel terrain-pane" aria-label={`Site ${slot} 3D view`} data-testid={`terrain-pane-${slot}`} data-site-id={info.id}>
      <h3>
        Site {slot}: {info.name}
      </h3>
      <p className="muted">
        NASA PGDA {info.product}, 5 m native, 20 m mesh, {(info.extentM[0] / 1000).toFixed(0)} × {(info.extentM[1] / 1000).toFixed(0)} km
        crop.
      </p>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            className="btn"
            onClick={() => {
              setError('')
              setAttempt((n) => n + 1)
            }}
          >
            Retry Site {slot} terrain
          </button>
        </div>
      ) : !asset || !hz ? (
        <p role="status">Loading verified NASA terrain for Site {slot}…</p>
      ) : site ? (
        <>
          <TerrainCanvas
            asset={asset}
            site={site}
            selectedPoint={picked}
            imagery={false}
            theme={theme}
            onPick={setPicked}
            visual={visual}
            link={link}
            linked={linked}
            bodies={bodies}
            label={`Site ${slot}`}
          />
          <p className="num" data-testid={`footprint-centre-${slot}`}>
            Footprint centre: {focus!.lat.toFixed(5)}° latitude, {focus!.lon.toFixed(5)}° E, {focus!.elevationM.toFixed(1)} m elevation (
            {picked ? 'picked point' : 'site location'}).
          </p>
          {light.stats && (
            <p
              className="num"
              data-testid={`lighting-stats-${slot}`}
              data-sun-any={light.stats.innerSunAnyPct}
              data-earth={light.stats.innerEarthPct}
            >
              Inner 6 × 6 km at the selected time: Sun visible from {light.stats.innerSunAnyPct.toFixed(1)} % (full disc{' '}
              {light.stats.innerSunFullPct.toFixed(1)} %), Earth in line of sight from {light.stats.innerEarthPct.toFixed(1)} %.
            </p>
          )}
          {lighting === 'psr' && illum?.data && (
            <p className="num">
              {(100 * illum.data.meta.psrFraction).toFixed(1)} % of the crop is mapped as permanently shadowed (static NASA map).
            </p>
          )}
          {illum?.error && <p role="alert">{illum.error}</p>}
          {picked && (
            <button className="btn" onClick={() => setPicked(null)}>
              Recentre Site {slot} footprint on the site location
            </button>
          )}
        </>
      ) : (
        <p>The site location is outside this terrain crop. No terrain is extrapolated.</p>
      )}
    </section>
  )
}
