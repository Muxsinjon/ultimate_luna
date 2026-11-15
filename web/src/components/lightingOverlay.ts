import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { vectorsAt } from '../lib/analysis'
import type { Ephemeris } from '../lib/data'
import { loadSiteIllumination } from '../lib/terrainCache'
import type { TerrainAsset } from '../lib/terrainMesh'
import { edgeDistanceM, illuminationField, vertexVisibility, type IlluminationAsset, type IlluminationField } from '../lib/terrainShadow'
import { cssVar, hexToRgb } from '../lib/theme'

export type LightingLayer = 'off' | 'sunlight' | 'earth' | 'psr'
/** shading is evaluated every SHADOW_STRIDE mesh vertices (4 × 20 m = 80 m) */
export const SHADOW_STRIDE = 4
/** vertices closer than this to the crop edge rely on coarser outside-crop terrain: shown faded, excluded from stats */
export const RIGOROUS_EDGE_M = 1000

export function useSiteIllumination(siteId: string | null) {
  const [state, setState] = useState<{ id: string; data: IlluminationAsset | null; error: string } | null>(null)
  useEffect(() => {
    if (!siteId) return
    let live = true
    loadSiteIllumination(siteId).then(
      (data) => live && setState({ id: siteId, data, error: '' }),
      (e: Error) => live && setState({ id: siteId, data: null, error: e.message }),
    )
    return () => {
      live = false
    }
  }, [siteId])
  return state && state.id === siteId ? state : null
}

export interface LightingStats {
  time: number
  field: IlluminationField
  /** stats over vertices ≥ RIGOROUS_EDGE_M from the edge */
  innerSunAnyPct: number
  innerSunFullPct: number
  innerEarthPct: number
  innerPsrPct: number
}

/** Shadow field at the selected time + overlay texture. Recomputed only when the hour or layer changes. */
export function useLightingOverlay(
  asset: TerrainAsset | null,
  illum: IlluminationAsset | null,
  layer: LightingLayer,
  eph: Ephemeris,
  time: number,
  theme: string,
) {
  const stats = useMemo<LightingStats | null>(() => {
    if (!asset || !illum || layer === 'off' || layer === 'psr') return null
    const { sun, earth } = vectorsAt(eph, time)
    const field = illuminationField(asset, illum.far, sun, earth, SHADOW_STRIDE)
    let n = 0,
      any = 0,
      full = 0,
      e = 0,
      psr = 0
    for (let i = 0; i < field.size; i++)
      for (let j = 0; j < field.size; j++) {
        const r = i * SHADOW_STRIDE,
          c = j * SHADOW_STRIDE
        if (edgeDistanceM(asset, r, c) < RIGOROUS_EDGE_M) continue
        n++
        const k = i * field.size + j
        if (field.sun[k] > 0) any++
        if (field.sun[k] >= 1) full++
        if (field.earth[k] > 0) e++
        if (illum.psr[r * asset.meta.width + c] === 1) psr++
      }
    return {
      time,
      field,
      innerSunAnyPct: (100 * any) / n,
      innerSunFullPct: (100 * full) / n,
      innerEarthPct: (100 * e) / n,
      innerPsrPct: (100 * psr) / n,
    }
  }, [asset, illum, layer, eph, time])
  const texture = useMemo(() => {
    if (!asset || !illum || layer === 'off') return null
    const psrLayer = layer === 'psr'
    const size = psrLayer ? asset.meta.width : stats?.field.size
    if (!size) return null
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(size, size)
    const dark = hexToRgb(cssVar('--c-terrain-bottom')),
      lit = hexToRgb(cssVar(layer === 'earth' ? '--c-earth' : '--c-sun')),
      none = hexToRgb(cssVar('--c-none')),
      psrC = hexToRgb(cssVar('--c-accent')),
      ground = hexToRgb(cssVar('--c-terrain-edge'))
    for (let i = 0; i < size; i++)
      for (let j = 0; j < size; j++) {
        const k = i * size + j
        let rgb: number[]
        if (psrLayer) {
          const v = illum.psr[k]
          rgb = v === 1 ? psrC : v === 255 ? none : ground
        } else {
          const f = (layer === 'earth' ? stats!.field.earth : stats!.field.sun)[k]
          rgb = dark.map((d, q) => Math.round(d * (1 - f) + lit[q] * f))
          if (edgeDistanceM(asset, i * SHADOW_STRIDE, j * SHADOW_STRIDE) < RIGOROUS_EDGE_M)
            rgb = rgb.map((v, q) => Math.round((v + none[q]) / 2))
        }
        img.data.set([...rgb, 255], k * 4)
      }
    ctx.putImageData(img, 0, 0)
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.magFilter = psrLayer ? THREE.NearestFilter : THREE.LinearFilter
    t.minFilter = THREE.LinearFilter
    t.generateMipmaps = false
    t.repeat.set((size - 1) / size, (size - 1) / size)
    t.offset.set(0.5 / size, 0.5 / size)
    return t
    // theme is a DOM token dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, illum, layer, stats, theme])
  useEffect(() => () => texture?.dispose(), [texture])
  return { texture, stats }
}

/** Visibility at one surface vertex (nearest mesh vertex to lat/lon) for the readout. */
export function pointVisibility(asset: TerrainAsset, illum: IlluminationAsset, r: number, c: number, eph: Ephemeris, time: number) {
  const { sun, earth } = vectorsAt(eph, time)
  return {
    ...vertexVisibility(asset, illum.far, r, c, sun, earth),
    psr: illum.psr[r * asset.meta.width + c],
    edgeM: edgeDistanceM(asset, r, c),
  }
}
