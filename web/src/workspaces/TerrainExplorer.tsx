import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_HAZARD_SETTINGS, type HazardSettings } from '../components/hazardTexture'
import HazardPanel, { type HazardVisual } from '../components/HazardPanel'
import SitePair from '../components/SitePair'
import SkyReadout from '../components/SkyReadout'
import LightingPanel from '../components/LightingPanel'
import SciencePanel, { useScience } from '../components/SciencePanel'
import { useLightingOverlay, useSiteIllumination, type LightingLayer } from '../components/lightingOverlay'
import TimeBar from '../components/TimeBar'
import { bodyVectorsFromSite } from '../lib/analysis'
import TerrainCanvas, { type CameraLink } from '../components/TerrainCanvas'
import TerrainComparePane, { type PaneResult } from '../components/TerrainComparePane'
import TerrainComparison from '../components/TerrainComparison'
import { useStore } from '../lib/store'
import {
  loadTerrainAsset,
  loadTerrainIndex,
  sampleGrid,
  terrainSiteFor,
  type SurfacePoint,
  type TerrainAsset,
  type TerrainIndex,
} from '../lib/terrainMesh'

export default function TerrainExplorer() {
  const { s, set, site, addCustom, customBusy, theme, data } = useStore()
  const [asset, setAsset] = useState<TerrainAsset | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0)
  const [picked, setPicked] = useState<SurfacePoint | null>(null),
    [lat, setLat] = useState(''),
    [lon, setLon] = useState(''),
    [pickError, setPickError] = useState(''),
    [imagery, setImagery] = useState(false)
  const [visual, setVisual] = useState<HazardVisual | null>(null)
  const [lighting, setLighting] = useState<LightingLayer>('off')
  const [index, setIndex] = useState<TerrainIndex | null>(null),
    [mode, setMode] = useState<'single' | 'compare'>('single'),
    [settings, setSettings] = useState<HazardSettings>(DEFAULT_HAZARD_SETTINGS),
    [linked, setLinked] = useState(true),
    [results, setResults] = useState<{ A: PaneResult | null; B: PaneResult | null }>({ A: null, B: null })
  const link = useMemo<CameraLink>(() => ({ members: new Map() }), [])
  const patch = useCallback((p: Partial<HazardSettings>) => setSettings((v) => ({ ...v, ...p })), [])
  const onResult = useCallback((slot: 'A' | 'B', r: PaneResult | null) => setResults((v) => ({ ...v, [slot]: r })), [])
  const st = site(s.surfaceSite === 'A' ? s.siteA : s.siteB)
  const siteA = site(s.siteA),
    siteB = site(s.siteB)
  const terrainA = index ? terrainSiteFor(index.sites, siteA.id, siteA.lat, siteA.lon) : null,
    terrainB = index ? terrainSiteFor(index.sites, siteB.id, siteB.lat, siteB.lon) : null
  const info = index ? terrainSiteFor(index.sites, st.id, st.lat, st.lon) : null
  const terrainId = info?.id ?? 'site01'
  useEffect(() => {
    if (index) return // loaded once; a retry after an asset failure must not restart the asset load
    const abort = new AbortController()
    loadTerrainIndex(abort.signal).then(
      (i) => {
        if (!abort.signal.aborted) setIndex(i)
      },
      (e: Error) => {
        if (!abort.signal.aborted) setError(e.message)
      },
    )
    return () => abort.abort()
  }, [attempt, index])
  useEffect(() => {
    if (!index) return
    const abort = new AbortController()
    let loaded: TerrainAsset | null = null
    loadTerrainAsset(abort.signal, terrainId).then(
      (a) => {
        if (abort.signal.aborted) {
          if (a.imageUrl) URL.revokeObjectURL(a.imageUrl)
          return
        }
        loaded = a
        setAsset(a)
      },
      (e: Error) => {
        if (!abort.signal.aborted) setError(e.message)
      },
    )
    return () => {
      abort.abort()
      if (loaded?.imageUrl) URL.revokeObjectURL(loaded.imageUrl)
    }
  }, [attempt, index, terrainId])
  const shown = asset && (asset.meta.siteId ?? 'site01') === terrainId ? asset : null
  const [pickedFor, setPickedFor] = useState(terrainId)
  if (pickedFor !== terrainId) {
    setPickedFor(terrainId)
    setPicked(null)
    setLat('')
    setLon('')
  }
  const elevation = shown && info ? sampleGrid(shown, st.lat, st.lon) : null
  const current = useMemo(
    () => (elevation === null ? null : { lat: st.lat, lon: st.lon, elevationM: elevation }),
    [st.lat, st.lon, elevation],
  )
  const bodies = useMemo(
    () => (current ? bodyVectorsFromSite(data.eph, s.selectedTime, current.lat, current.lon, current.elevationM) : null),
    [current, data, s.selectedTime],
  )
  const illum = useSiteIllumination(lighting === 'off' || !info ? null : terrainId)
  const light = useLightingOverlay(shown, illum?.data ?? null, lighting, data.eph, s.selectedTime, theme)
  const science = useScience(info ? terrainId : null, shown, theme)
  const shownVisual = useMemo<HazardVisual | null>(
    () =>
      science.texture
        ? { texture: science.texture, layer: 'science', footprint: visual?.footprint ?? null }
        : lighting === 'off'
          ? visual
          : { texture: light.texture, layer: lighting, footprint: visual?.footprint ?? null },
    [lighting, visual, light.texture, science.texture],
  )
  const pick = (p: SurfacePoint) => {
    setPicked(p)
    setLat(p.lat.toFixed(5))
    setLon(p.lon.toFixed(5))
    setPickError('')
  }
  const applyPoint = async () => {
    if (!picked) return
    try {
      await addCustom(picked.lat, picked.lon, s.surfaceSite)
    } catch {
      setPickError('Planner terrain failed to load. Try again.')
    }
  }
  const rms = shown && picked ? sampleGrid(shown, picked.lat, picked.lon, shown.errors) : null
  return (
    <div className="workspace terrain-ws">
      <aside className="rail">
        <SitePair />
      </aside>
      <section className="stage" aria-labelledby="terrain-title">
        <div className="stage-head">
          <div>
            <h2 id="terrain-title">3D lunar terrain explorer</h2>
            <p className="lede">
              {mode === 'compare'
                ? 'Site A and Site B side by side on NASA LOLA 5 m terrain, screened with one shared footprint and thresholds.'
                : `${info?.name ?? 'Connecting Ridge'}, NASA LOLA ${info?.product ?? 'Site01'}. Explore an actual lunar elevation mesh and choose a mission location.`}
            </p>
          </div>
          <div className="seg" role="radiogroup" aria-label="Terrain layout">
            {(
              [
                ['single', 'One site'],
                ['compare', 'Compare A and B'],
              ] as const
            ).map(([m, text]) => (
              <button
                type="button"
                key={m}
                role="radio"
                aria-checked={mode === m}
                className={mode === m ? 'on' : ''}
                onClick={() => setMode(m)}
              >
                {text}
              </button>
            ))}
          </div>
          {mode === 'single' && (
            <div className="seg" role="radiogroup" aria-label="Terrain site shown">
              {(['A', 'B'] as const).map((slot) => (
                <button
                  type="button"
                  key={slot}
                  role="radio"
                  aria-checked={s.surfaceSite === slot}
                  className={s.surfaceSite === slot ? 'on' : ''}
                  onClick={() => set({ surfaceSite: slot })}
                >
                  Site {slot}
                </button>
              ))}
            </div>
          )}
        </div>
        <TimeBar />
        {index && (
          <div className="terrain-toolbar">
            {(['A', 'B'] as const).map((slot) => {
              const current = slot === 'A' ? terrainA : terrainB
              return (
                <label className="field" key={slot}>
                  <span>Site {slot} terrain</span>
                  <select
                    aria-label={`Site ${slot} terrain`}
                    value={current?.id ?? ''}
                    onChange={(e) => {
                      const t = index.sites.find((x) => x.id === e.target.value)
                      if (t) set(slot === 'A' ? { siteA: t.plannerId } : { siteB: t.plannerId })
                    }}
                  >
                    {!current && <option value="">No processed terrain at this site</option>}
                    {index.sites.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.product})
                      </option>
                    ))}
                  </select>
                </label>
              )
            })}
            <button type="button" className="btn" onClick={() => set({ ws: 'compare' })}>
              Sun and Earth charts for these sites
            </button>
            <button type="button" className="btn" onClick={() => set({ ws: 'finder' })}>
              Mission windows for these sites
            </button>
            <button type="button" className="btn" onClick={() => set({ ws: 'surface' })}>
              Surface view
            </button>
            <button type="button" className="btn" onClick={() => set({ ws: 'surface', surface3d: true })}>
              Enter first-person view
            </button>
          </div>
        )}
        {error ? (
          <div role="alert">
            <p>{error}</p>
            <button
              className="btn"
              onClick={() => {
                setError('')
                setAttempt((a) => a + 1)
              }}
            >
              Retry terrain loading
            </button>
          </div>
        ) : mode === 'compare' && index ? (
          <>
            <div className="terrain-toolbar">
              <label className="toggle">
                <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} /> Link cameras (same scale and
                viewing direction)
              </label>
              <label className="field">
                Lighting layer (both sites)
                <select aria-label="Lighting layer" value={lighting} onChange={(e) => setLighting(e.target.value as LightingLayer)}>
                  <option value="off">Off (use the overlay layer)</option>
                  <option value="sunlight">Sunlight at the selected time (computed)</option>
                  <option value="earth">Earth line of sight at the selected time (computed)</option>
                  <option value="psr">Permanently shadowed regions (NASA PGDA, static context)</option>
                </select>
              </label>
            </div>
            {lighting !== 'off' && (
              <p className="hint">
                Lighting is computed for each site at the selected time from its own terrain (20 m mesh inside the crop, LOLA 240 m outside,
                2 m observer, upper-limb rule). Faded areas within 1 km of a crop edge are illustrative. Earth line of sight is geometric
                and does not guarantee communication. The permanent-shadow map is static context, not a date prediction.
              </p>
            )}
            <p className="hint">
              Linked views share the camera offset in metres around each site, so both terrains appear at the same physical scale and
              orientation (X east, Y up, Z south). The two crops are separate places; side by side does not mean adjacent.
            </p>
            <div className="adv">
              <SharedCriteria settings={settings} onSettings={patch} />
            </div>
            <div className="terrain-compare">
              {(['A', 'B'] as const).map((slot) => {
                const t = slot === 'A' ? terrainA : terrainB,
                  ps = slot === 'A' ? siteA : siteB
                return t ? (
                  <TerrainComparePane
                    key={t.id + ':' + ps.id}
                    slot={slot}
                    info={t}
                    centre={{ lat: ps.lat, lon: ps.lon }}
                    settings={settings}
                    theme={theme}
                    link={link}
                    linked={linked}
                    onResult={onResult}
                    lighting={lighting}
                  />
                ) : (
                  <section className="panel terrain-pane" key={slot} data-testid={`terrain-pane-${slot}`}>
                    <h3>
                      Site {slot}: {ps.name}
                    </h3>
                    <p>No processed 5 m terrain covers this site, so it is marked insufficient data. Choose a terrain site above.</p>
                  </section>
                )
              })}
            </div>
            <TerrainComparison
              a={{ name: `Site A (${siteA.name})`, info: terrainA, result: results.A?.siteId === terrainA?.id ? results.A : null }}
              b={{ name: `Site B (${siteB.name})`, info: terrainB, result: results.B?.siteId === terrainB?.id ? results.B : null }}
              settings={settings}
            />
          </>
        ) : !shown ? (
          <p role="status">Loading verified NASA terrain…</p>
        ) : (
          <>
            <p className="terrain-quality adv">
              Real NASA PGDA {shown.meta.product ?? 'Site01'} elevation: 5 m source pixels, 20 m mesh spacing, 8 × 8 km coverage. True
              horizontal and vertical scale (1×), including lunar curvature.
            </p>
            <p className="muted adv">
              {st.name}. About 90% of native pixels are interpolated between laser returns. Pixel spacing is not measurement accuracy.
            </p>
            {shown.meta.imagery && (
              <p className="hint" data-testid="registration-warning">
                LROC WAC registration is unverified. The texture is off by default and available only as optional context; geographic
                reprojection does not establish landmark alignment accuracy.
              </p>
            )}
            <div className="terrain-toolbar">
              <label className="field">
                <span>Terrain appearance</span>
                <select
                  aria-label="Terrain appearance"
                  value={imagery ? 'imagery' : 'elevation'}
                  onChange={(e) => setImagery(e.target.value === 'imagery')}
                >
                  <option value="elevation">Shaded elevation</option>
                  {shown.meta.imagery && <option value="imagery">LROC WAC — registration unverified</option>}
                </select>
              </label>
            </div>
            {current ? (
              <TerrainCanvas
                key={st.id + ':' + attempt + ':' + imagery}
                asset={shown}
                site={current}
                selectedPoint={picked}
                imagery={imagery}
                theme={theme}
                onPick={pick}
                visual={shownVisual}
                bodies={bodies}
              />
            ) : (
              <div className="panel">
                <p>This site is outside every processed terrain crop. No terrain is extrapolated.</p>
                <button
                  className="btn"
                  onClick={() => set(s.surfaceSite === 'A' ? { siteA: 'connecting-ridge' } : { siteB: 'connecting-ridge' })}
                >
                  Show Connecting Ridge
                </button>
              </div>
            )}
            {current && <SkyReadout site={st} slot={s.surfaceSite} />}
            {current && (
              <LightingPanel
                layer={lighting}
                onLayer={setLighting}
                asset={shown}
                illum={illum?.data ?? null}
                error={illum?.error ?? ''}
                stats={light.stats}
                point={picked ?? current}
                site={st}
              />
            )}
            {current && (
              <div className="adv">
                <SciencePanel science={science} asset={shown} point={picked ?? current} />
              </div>
            )}
            <p className="hint">
              Drag to rotate, scroll or pinch to zoom, right drag or two fingers to pan. Focus the canvas and use arrow keys to pan, or use
              the camera buttons. Click terrain to select a point. Magenta marks the mission site; cyan marks your picked point. Local axes:
              X east, Y up, Z south. Inspection lighting does not model mission sunlight.
            </p>
            {imagery && <p className="hint">{shown.meta.imagery?.note}</p>}
            <section className="panel adv">
              <h3>Selected surface point</h3>
              <p
                className="num"
                aria-live="polite"
                data-testid="terrain-readout"
                data-lat={picked?.lat}
                data-lon={picked?.lon}
                data-elevation-m={picked?.elevationM}
              >
                {picked
                  ? `${picked.lat.toFixed(5)}° latitude, ${picked.lon.toFixed(5)}° E, ${picked.elevationM.toFixed(1)} m elevation`
                  : 'Click terrain or enter lunar coordinates to inspect elevation.'}
              </p>
              {picked && (
                <p>
                  Source height uncertainty (RMS): {rms === null ? 'unavailable' : `${rms.toFixed(2)} m`}. This does not include mesh
                  decimation error or image registration error.
                </p>
              )}
              <form
                className="terrain-toolbar"
                onSubmit={(e) => {
                  e.preventDefault()
                  const la = Number(lat),
                    lo = Number(lon)
                  if (!lat.trim() || !lon.trim() || !Number.isFinite(la) || Math.abs(la) > 90 || !Number.isFinite(lo)) {
                    setPickError('Enter a valid lunar latitude and east longitude.')
                    return
                  }
                  const h = sampleGrid(shown, la, lo)
                  if (h === null) {
                    setPickError('Coordinates are outside valid terrain coverage.')
                    return
                  }
                  pick({ lat: la, lon: ((lo % 360) + 360) % 360, elevationM: h })
                }}
              >
                <label className="field">
                  <span>Latitude (degrees)</span>
                  <input type="number" step="any" min="-90" max="90" value={lat} onChange={(e) => setLat(e.target.value)} />
                </label>
                <label className="field">
                  <span>East longitude (degrees)</span>
                  <input type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)} />
                </label>
                <button className="btn" type="submit">
                  Inspect coordinates
                </button>
              </form>
              <button className="btn" disabled={!picked || customBusy} onClick={() => void applyPoint()}>
                {customBusy ? 'Computing horizon…' : `Use selected point as Site ${s.surfaceSite}`}
              </button>
              {pickError && <p role="alert">{pickError}</p>}
              <p className="hint">
                Elevation is relative to the 1737.4 km lunar sphere. Clicks report the rendered triangle surface; coordinate entry samples
                the 20 m grid bilinearly. Decimal places do not imply accuracy. Planner custom-site horizons still use the existing 960 m
                regional DEM over 250 km, not this local mesh.
              </p>
            </section>
            <div className="adv">
              <HazardPanel
                key={terrainId}
                asset={shown}
                point={picked}
                theme={theme}
                onVisual={setVisual}
                siteId={terrainId}
                siteName={shown.meta.product ?? 'Site01'}
                settings={settings}
                onSettings={patch}
              />
            </div>
            <details className="panel adv">
              <summary>Sources, uncertainty and image alignment</summary>
              <p>
                <a href="https://pgda.gsfc.nasa.gov/products/78" target="_blank" rel="noreferrer">
                  NASA GSFC PGDA, Barker et al. (2021), {shown.meta.product ?? 'Site01'} adjusted LOLA DEM
                </a>
              </p>
              <p>{shown.meta.uncertaintyNote} The product uses MOON_ME/DE421; existing astronomical calculations are unchanged.</p>
              <p>
                Mesh decimation relative to the native 5 m DEM adds {shown.meta.decimationResidualM.rms.toFixed(2)} m RMS error over this
                crop (maximum {shown.meta.decimationResidualM.maxAbs.toFixed(2)} m). These residuals are separate from source uncertainty.
              </p>
              <p>
                DEM SHA-256: <code className="terrain-hash">{shown.meta.sources.surf.sha256}</code>
              </p>
              {shown.meta.imagery && (
                <p>
                  <a href={shown.meta.imagery.url} target="_blank" rel="noreferrer">
                    {shown.meta.imagery.title}
                  </a>
                  . Map-coordinate reprojection is checked, but image-to-terrain registration is unverified. No independent landmark
                  residual or subpixel image/DEM co-registration has been established. WAC is coarse context imagery, not high-resolution
                  NAC.
                </p>
              )}
            </details>
          </>
        )}
      </section>
    </div>
  )
}

function SharedCriteria({ settings, onSettings }: { settings: HazardSettings; onSettings: (p: Partial<HazardSettings>) => void }) {
  const num = (v: number) => (Number.isFinite(v) ? v : '')
  return (
    <fieldset className="panel">
      <legend>Shared screening criteria (applied identically to both sites)</legend>
      <div className="terrain-toolbar">
        <label className="field">
          Overlay layer
          <select
            aria-label="Overlay layer"
            value={settings.layer}
            onChange={(e) => onSettings({ layer: e.target.value as HazardSettings['layer'] })}
          >
            <option value="elevation">Elevation</option>
            <option value="slope">Slope (3×3 OLS)</option>
            <option value="roughness">Roughness</option>
            <option value="hazard">Hazard Assessment</option>
          </select>
        </label>
        <label className="field">
          Maximum slope (degrees; 15 m support)
          <input
            aria-label="Shared maximum slope"
            type="number"
            min="0"
            max="90"
            step="1"
            value={num(settings.maxSlope)}
            onChange={(e) => onSettings({ maxSlope: e.target.valueAsNumber })}
          />
        </label>
        <label className="field">
          Maximum roughness (m RMS; 25 m support)
          <input
            aria-label="Shared maximum roughness"
            type="number"
            min="0"
            step="0.05"
            value={num(settings.maxRough)}
            onChange={(e) => onSettings({ maxRough: e.target.valueAsNumber })}
          />
        </label>
        <label className="field">
          Footprint radius (m)
          <input
            aria-label="Shared footprint radius"
            type="number"
            min="5"
            max="2000"
            step="25"
            value={num(settings.radius)}
            onChange={(e) => onSettings({ radius: e.target.valueAsNumber })}
          />
        </label>
        <label className="field">
          Required share meeting both criteria (%)
          <input
            aria-label="Required share meeting both criteria"
            type="number"
            min="0"
            max="100"
            step="5"
            value={num(settings.minMeetsPct)}
            onChange={(e) => onSettings({ minMeetsPct: e.target.valueAsNumber })}
          />
        </label>
      </div>
      <p className="hint">
        Threshold defaults are illustrative, not NASA safety standards. Both sites use the same 5 m native layers, the same estimators (3 ×
        3 OLS slope, 5 × 5 detrended RMS roughness), the same footprint radius and the same thresholds. Overlay legend: slope and roughness
        ramp blue to orange (≥30°, ≥1 m); hazard green meets, orange exceeds, gray insufficient data.
      </p>
    </fieldset>
  )
}
