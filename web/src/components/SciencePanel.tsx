// Milestone 8: optional science overlays (layer toggle, opacity, legend, source metadata, caveats, point readout).
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import {
  formatScience,
  legendPosition,
  loadScienceIndex,
  loadScienceLayer,
  valueAtVertex,
  decodeValue,
  type ScienceIndex,
  type ScienceLayer,
  type ScienceLayerMeta,
} from '../lib/scienceLayers'
import { nearestVertex } from '../lib/firstPerson'
import type { SurfacePoint, TerrainAsset } from '../lib/terrainMesh'
import { cssVar, hexToRgb } from '../lib/theme'

const PALETTES: Record<ScienceLayerMeta['legend']['palette'], string[]> = {
  thermal: ['--c-earth', '--c-both', '--c-sun', '--c-warn'],
  ice: ['--c-accent', '--c-earth', '--c-site-b'],
  gray: ['--c-terrain-bottom', '--c-site-a'],
}

function ramp(stops: number[][], t: number) {
  const x = t * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  const f = x - i
  return stops[i].map((c, k) => Math.round(c * (1 - f) + stops[i + 1][k] * f))
}

/** Overlay texture + panel state for the selected science layer (null texture = layer off). */
export function useScience(siteId: string | null, asset: TerrainAsset | null, theme: string) {
  const [index, setIndex] = useState<{ id: string; x: ScienceIndex | null; error: string } | null>(null)
  const [selected, setSelected] = useState('off')
  const [opacity, setOpacity] = useState(0.85)
  const [layer, setLayer] = useState<{ key: string; l: ScienceLayer | null; error: string } | null>(null)
  useEffect(() => {
    if (!siteId) return
    let live = true
    loadScienceIndex(siteId).then(
      (x) => live && setIndex({ id: siteId, x, error: '' }),
      (e: Error) => live && setIndex({ id: siteId, x: null, error: e.message }),
    )
    return () => {
      live = false
    }
  }, [siteId])
  const idx = index && index.id === siteId ? index : null
  const meta = idx?.x?.layers.find((l) => l.id === selected) ?? null
  const key = `${siteId}:${meta?.id}`
  useEffect(() => {
    if (!meta || !siteId) return
    let live = true
    loadScienceLayer(siteId, meta).then(
      (l) => live && setLayer({ key: `${siteId}:${meta.id}`, l, error: '' }),
      (e: Error) => live && setLayer({ key: `${siteId}:${meta.id}`, l: null, error: e.message }),
    )
    return () => {
      live = false
    }
  }, [meta, siteId])
  const current = layer && layer.key === key ? layer : null
  const texture = useMemo(() => {
    const l = current?.l
    if (!l || !asset) return null
    const m = l.meta
    const canvas = document.createElement('canvas')
    canvas.width = m.width
    canvas.height = m.height
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(m.width, m.height)
    const stops = PALETTES[m.legend.palette].map((t) => hexToRgb(cssVar(t)))
    const base = hexToRgb(cssVar('--c-terrain-edge')),
      none = hexToRgb(cssVar('--c-none')),
      special = hexToRgb(cssVar('--c-terrain-top'))
    for (let i = 0; i < l.raw.length; i++) {
      const v = decodeValue(m, l.raw[i])
      const p = legendPosition(m, v)
      const c = v.kind === 'nodata' ? none : v.kind === 'special' ? special : ramp(stops, p!)
      const a = v.kind === 'nodata' ? 0.35 : opacity
      img.data.set([...c.map((x, k) => Math.round(base[k] * (1 - a) + x * a)), 255], i * 4)
    }
    ctx.putImageData(img, 0, 0)
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.magFilter = THREE.NearestFilter
    t.minFilter = THREE.LinearFilter
    t.generateMipmaps = false
    t.repeat.set((m.width - 1) / m.width, (m.height - 1) / m.height)
    t.offset.set(0.5 / m.width, 0.5 / m.height)
    return t
    // theme is a DOM token dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, asset, opacity, theme])
  useEffect(() => () => texture?.dispose(), [texture])
  return {
    index: idx,
    selected,
    setSelected,
    opacity,
    setOpacity,
    layer: current?.l ?? null,
    error: idx?.error || current?.error || '',
    texture: selected === 'off' ? null : texture,
  }
}

export default function SciencePanel({
  science,
  asset,
  point,
}: {
  science: ReturnType<typeof useScience>
  asset: TerrainAsset
  point: SurfacePoint | null
}) {
  const { index, selected, setSelected, opacity, setOpacity, layer, error } = science
  const meta = index?.x?.layers.find((l) => l.id === selected) ?? null
  const vtx = point ? nearestVertex(asset, point.lat, point.lon) : null
  const here = layer && vtx ? valueAtVertex(layer, vtx.r, vtx.c) : null
  const stops = meta ? PALETTES[meta.legend.palette].map((t) => cssVar(t)) : []
  return (
    <section className="panel" aria-labelledby="science-h">
      <h3 id="science-h">Science layers (optional context)</h3>
      {!index ? (
        <p role="status">Loading the list of science layers…</p>
      ) : !index.x || index.x.layers.length === 0 ? (
        <p>No science layers are available for this site.</p>
      ) : (
        <>
          <div className="terrain-toolbar">
            <label className="field">
              Science layer
              <select aria-label="Science layer" value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="off">Off</option>
                {index.x.layers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </label>
            {selected !== 'off' && (
              <label className="field">
                Layer opacity ({Math.round(opacity * 100)} %)
                <input
                  aria-label="Layer opacity"
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={opacity}
                  onChange={(e) => setOpacity(e.target.valueAsNumber)}
                />
              </label>
            )}
          </div>
          {meta && (
            <div data-testid="science-meta" data-layer={meta.id} data-kind={meta.kind}>
              <p>
                <strong className={`badge ${meta.kind === 'model' ? 'warn' : ''}`}>
                  {meta.kind === 'model' ? 'Model-derived' : 'Observation'}
                </strong>{' '}
                {meta.title}. {meta.period}. Resolution about {meta.resolutionM} m; {meta.validPct.toFixed(1)} % of this crop has data
                {meta.specials?.map((x) => `; ${x.pct.toFixed(1)} %: ${x.label}`).join('')}.
              </p>
              <div className="sci-legend" aria-label={`Legend from ${meta.legend.min} to ${meta.legend.max} ${meta.unit}`}>
                <span className="num">
                  {meta.legend.min} {meta.unit}
                </span>
                <span className="sci-ramp" style={{ background: `linear-gradient(90deg, ${stops.join(', ')})` }} />
                <span className="num">
                  {Number(meta.legend.max.toFixed(3))} {meta.unit}
                </span>
              </div>
              {meta.specials && <p className="hint">Brown: coded states listed above (not values). Gray: no data.</p>}
              {here && (
                <p className="num" data-testid="science-point">
                  Selected point: {formatScience(meta, here)}
                </p>
              )}
              <ul className="small">
                {meta.caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <p className="small">
                Source:{' '}
                <a href={meta.source.url} target="_blank" rel="noreferrer">
                  {meta.source.title}
                </a>
                . {meta.source.citation}.
              </p>
            </div>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <p className="hint">
        These layers are context, not mission predictions or landing-safety criteria, and they are never combined into a score. LEND,
        Mini-RF, M3 and CRaTER are not shown; see the Milestone 8 acceptance report for why.
      </p>
    </section>
  )
}
