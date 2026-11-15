// Milestone 8: optional science overlays on the processed 5 m terrain sites. Pure decoding and lookup; no DOM.
// Each site has terrain/<site>/science/index.json listing layers sampled on its mesh vertices (every `stride`).
import { checkedFile, terrainBase } from './terrainMesh'

export interface ScienceLayerMeta {
  id: string
  title: string
  /** 'observation' = measured data; 'model' = model-derived product */
  kind: 'observation' | 'model'
  quantity: string
  unit: string
  scale: number
  offset: number
  noData: number
  /** coded states that are not values (e.g. 'no stable ice within 2.87 m', undocumented source codes) */
  specials?: { value: number; label: string; pct: number }[]
  width: number
  height: number
  /** sample spacing in mesh vertices (mesh vertex spacing is 20 m) */
  stride: number
  file: string
  sha256: string
  validPct: number
  min: number | null
  max: number | null
  resolutionM: number
  period: string
  legend: { min: number; max: number; palette: 'thermal' | 'ice' | 'gray' }
  source: { title: string; url: string; label?: string; citation: string }
  caveats: string[]
}

export interface ScienceIndex {
  version: number
  siteId: string
  layers: ScienceLayerMeta[]
}

export interface ScienceLayer {
  meta: ScienceLayerMeta
  raw: Uint16Array
}

/** A decoded sample: a value in the layer's unit, the special state, or no data (never a guess). */
export type ScienceValue = { kind: 'value'; value: number } | { kind: 'special'; label: string } | { kind: 'nodata' }

export function decodeValue(m: ScienceLayerMeta, q: number): ScienceValue {
  if (q === m.noData) return { kind: 'nodata' }
  const sp = m.specials?.find((x) => x.value === q)
  if (sp) return { kind: 'special', label: sp.label }
  return { kind: 'value', value: q * m.scale + m.offset }
}

/** Value at mesh vertex (r, c): nearest layer sample (the layer grid is aligned with the mesh at every `stride`). */
export function valueAtVertex(l: ScienceLayer, r: number, c: number): ScienceValue {
  const m = l.meta
  const i = Math.round(r / m.stride),
    j = Math.round(c / m.stride)
  if (i < 0 || j < 0 || i >= m.height || j >= m.width) return { kind: 'nodata' }
  return decodeValue(m, l.raw[i * m.width + j])
}

/** Normalised legend position 0..1 (clamped) or null for no data / special. */
export function legendPosition(m: ScienceLayerMeta, v: ScienceValue): number | null {
  if (v.kind !== 'value') return null
  const t = (v.value - m.legend.min) / (m.legend.max - m.legend.min)
  return Math.max(0, Math.min(1, t))
}

export function formatScience(m: ScienceLayerMeta, v: ScienceValue): string {
  if (v.kind === 'nodata') return 'No data'
  if (v.kind === 'special') return v.label
  const digits = m.unit === 'K' ? 1 : m.unit === 'm' ? 2 : 3
  return `${v.value.toFixed(digits)} ${m.unit}`
}

export function validateScienceIndex(x: ScienceIndex, siteId: string) {
  if (x.version !== 1 || x.siteId !== siteId || !Array.isArray(x.layers)) throw new Error('Science layer list belongs to a different site')
  for (const l of x.layers)
    if (
      !(l.scale > 0) ||
      !Number.isInteger(l.width) ||
      l.width < 2 ||
      l.width !== l.height ||
      l.stride < 1 ||
      (l.width - 1) * l.stride !== 400
    )
      throw new Error(`Science layer ${l.id} is not aligned with the 401 × 401 terrain mesh`)
}

export async function loadScienceIndex(siteId: string, signal?: AbortSignal): Promise<ScienceIndex | null> {
  const r = await fetch(terrainBase(siteId) + 'science/index.json', { signal })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`Could not load science layers (HTTP ${r.status})`)
  const x = (await r.json()) as ScienceIndex
  validateScienceIndex(x, siteId)
  return x
}

export async function loadScienceLayer(siteId: string, meta: ScienceLayerMeta, signal?: AbortSignal): Promise<ScienceLayer> {
  const bytes = await checkedFile(terrainBase(siteId) + 'science/', meta, signal)
  if (bytes.byteLength !== meta.width * meta.height * 2) throw new Error(`Science layer ${meta.id} has the wrong size`)
  const v = new DataView(bytes)
  const raw = new Uint16Array(meta.width * meta.height)
  for (let i = 0; i < raw.length; i++) raw[i] = v.getUint16(i * 2, true)
  return { meta, raw }
}
