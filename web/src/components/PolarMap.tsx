import { useEffect, useMemo, useRef, useState } from 'react'
import type { Site, Terrain } from '../lib/data'
import { loadTerrain } from '../lib/data'
import { INFO } from '../lib/glossary'
import { normalizeLon360 } from '../lib/physics/lon'
import { polarLatLon, polarXY } from '../lib/terrain'
import { cssVar, hexToRgb, type Theme } from '../lib/theme'
import { InfoTip, Skeleton } from './ui'

interface Props {
  sites: Site[]
  siteA: string
  siteB: string
  theme: Theme
  /** a click on the map at (lat, lon) for the chosen slot */
  onPick: (lat: number, lon: number, slot: 'A' | 'B') => void
  onSelect: (id: string, slot: 'A' | 'B') => void
}

type Layer = 'sun' | 'earth' | 'terrain'
const EXTENTS = { '80° S': -80, '85° S': -85, '88° S': -88 } as const
type Extent = keyof typeof EXTENTS

export default function PolarMap({ sites, siteA, siteB, theme, onPick, onSelect }: Props) {
  const [target, setTarget] = useState<'A' | 'B'>('A')
  const [terrain, setTerrain] = useState<Terrain | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [requested, setRequested] = useState(false)
  const [layer, setLayer] = useState<Layer>('sun')
  const [extent, setExtent] = useState<Extent>('85° S')
  const canvas = useRef<HTMLCanvasElement>(null)

  const fetchTerrain = () => {
    setRequested(true)
    return loadTerrain().then(setTerrain, (e: Error) => setError(e.message))
  }
  const section = useRef<HTMLElement>(null)
  // load the 5.7 MB of terrain only when the map is about to scroll into view
  useEffect(() => {
    const el = section.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      void fetchTerrain()
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          void fetchTerrain()
        }
      },
      { rootMargin: '300px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const load = () => {
    setError(null)
    void fetchTerrain()
  }

  const n = terrain?.polar.meta.n ?? 953
  const scaleM = terrain?.polar.meta.scaleM ?? 960
  const offsetPx = terrain?.polar.meta.offsetPx ?? 476.5
  const halfPx = Math.ceil(Math.abs(polarXY(EXTENTS[extent], 0).y) / scaleM)
  const size = 2 * halfPx

  const shade = useMemo(() => {
    if (!terrain) return null
    const h = terrain.polar.h
    const out = new Float32Array(n * n)
    for (let r = 1; r < n - 1; r++)
      for (let c = 1; c < n - 1; c++) {
        const dx = (h[r * n + c + 1] - h[r * n + c - 1]) / (2 * scaleM)
        const dy = (h[(r - 1) * n + c] - h[(r + 1) * n + c]) / (2 * scaleM)
        const s = 0.55 + (0.9 * (-dx * 0.7 + dy * 0.7)) / Math.sqrt(1 + dx * dx + dy * dy)
        out[r * n + c] = Math.max(0, Math.min(1.2, s))
      }
    return out
  }, [terrain, n, scaleM])

  useEffect(() => {
    const cv = canvas.current
    if (!cv || !terrain || !shade) return
    cv.width = size
    cv.height = size
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(size, size)
    const c0 = Math.round(offsetPx - halfPx)
    const ov = layer === 'terrain' ? null : terrain.pgda?.[layer]
    const lowC = hexToRgb(cssVar('--c-sky-night'))
    const hiC = hexToRgb(cssVar(layer === 'earth' ? '--c-earth' : '--c-sun'))
    const grey = hexToRgb(cssVar('--c-terrain-edge'))
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) {
        const rr = c0 + r
        const cc = c0 + c
        const k = (r * size + c) * 4
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue
        const s = shade[rr * n + cc]
        let rgb = [grey[0] * s, grey[1] * s, grey[2] * s]
        if (ov) {
          const v = ov[rr * n + cc]
          if (v !== 255) {
            const t = Math.pow(v / 100, 0.8)
            const m = 0.45 + 0.55 * Math.min(1, s)
            rgb = [0, 1, 2].map((i) => (lowC[i] + (hiC[i] - lowC[i]) * t) * m)
          }
        }
        img.data[k] = rgb[0]
        img.data[k + 1] = rgb[1]
        img.data[k + 2] = rgb[2]
        img.data[k + 3] = 255
      }
    ctx.putImageData(img, 0, 0)
  }, [terrain, shade, layer, size, halfPx, offsetPx, n, theme])

  const toFrac = (lat: number, lon: number) => {
    const { x, y } = polarXY(lat, lon)
    return { fx: (x / scaleM + halfPx) / size, fy: (-y / scaleM + halfPx) / size }
  }

  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!terrain) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = (((e.clientX - r.left) / r.width) * size - halfPx) * scaleM
    const y = -(((e.clientY - r.top) / r.height) * size - halfPx) * scaleM
    const { lat, lon } = polarLatLon(x, y)
    if (lat <= EXTENTS[extent] + 0.01) onPick(lat, normalizeLon360(lon), target)
  }

  const visible = sites.filter((s) => s.lat <= EXTENTS[extent])
  return (
    <section ref={section} className="panel polarmap" aria-labelledby="map-title">
      <div className="panel-head">
        <h2 id="map-title" className="panel-title">
          South pole map <InfoTip info={INFO.map} label="the south pole map" />
        </h2>
        <select value={extent} onChange={(e) => setExtent(e.target.value as Extent)} aria-label="Map extent">
          {Object.keys(EXTENTS).map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </div>
      <div className="seg full" role="radiogroup" aria-label="Map layer">
        {(['sun', 'earth', 'terrain'] as Layer[]).map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={layer === l}
            className={layer === l ? 'on' : ''}
            onClick={() => setLayer(l)}
          >
            {l === 'sun' ? 'Sunlight' : l === 'earth' ? 'Earth view' : 'Terrain'}
          </button>
        ))}
      </div>
      <div className="row between">
        <span className="hint">Clicking a pin or the map sets</span>
        <div className="seg" role="radiogroup" aria-label="Map click sets">
          {(['A', 'B'] as const).map((x) => (
            <button
              key={x}
              type="button"
              role="radio"
              aria-checked={target === x}
              className={target === x ? 'on' : ''}
              onClick={() => setTarget(x)}
            >
              Site {x}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <div className="state-error small" role="alert">
          <p>Map data didn't load: {error}</p>
          <button type="button" className="btn" onClick={load}>
            Retry
          </button>
        </div>
      ) : !terrain ? (
        requested ? (
          <Skeleton h={0} r="var(--r-md)" />
        ) : (
          <div className="map-idle" aria-hidden />
        )
      ) : (
        <div className="mapbox" onClick={click} title="Click to analyse any spot">
          <canvas ref={canvas} aria-label={`South polar map to ${extent}. Click anywhere to analyse that spot.`} role="img" />
          {visible.map((x) => {
            const { fx, fy } = toFrac(x.lat, x.lon)
            const slot = x.id === siteA ? 'A' : x.id === siteB ? 'B' : null
            return (
              <button
                key={x.id}
                type="button"
                className={`pin ${slot ? `pin-${slot.toLowerCase()}` : ''} ${x.custom ? 'custom' : ''}`}
                style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(x.id, target)
                }}
                // pointer shortcut only: the Site A / Site B lists are the accessible equivalent (WCAG 2.5.8)
                tabIndex={-1}
                aria-hidden
                title={`${x.name}${slot ? ` (Site ${slot})` : ''}`}
              >
                {slot && <span className="pin-letter">{slot}</span>}
              </button>
            )
          })}
          <span className="maplabel n">0°</span>
          <span className="maplabel e">90° E</span>
          <span className="maplabel s">180°</span>
          <span className="maplabel w">90° W</span>
        </div>
      )}
      {layer !== 'terrain' && (
        <div className="ramp" aria-hidden>
          <span>0 %</span>
          <span className={`ramp-bar ramp-${layer}`} />
          <span>100 % of the time</span>
        </div>
      )}
      <p className="hint">
        Clicking an empty spot analyses those exact coordinates with LOLA terrain. A few hundred metres can change everything.
      </p>
    </section>
  )
}
