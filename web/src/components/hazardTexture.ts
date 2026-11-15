import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { classify, valuesAtIndex, type AnalysisLayer, type Criteria, type HazardData } from '../lib/hazardAnalysis'
import { cssVar, hexToRgb } from '../lib/theme'

export interface HazardSettings {
  layer: AnalysisLayer
  maxSlope: number
  maxRough: number
  radius: number
  /** minimum % of valid footprint samples that must meet both criteria (comparison screen) */
  minMeetsPct: number
}
export const DEFAULT_HAZARD_SETTINGS: HazardSettings = { layer: 'elevation', maxSlope: 10, maxRough: 0.3, radius: 100, minMeetsPct: 90 }

/** Overlay texture on the native 5 m grid: continuous slope/roughness ramps or the three-state hazard class. */
export function useHazardTexture(data: HazardData | null, layer: AnalysisLayer, criteria: Criteria, theme: string) {
  const texture = useMemo(() => {
    if (!data || layer === 'elevation') return null
    const canvas = document.createElement('canvas')
    canvas.width = data.meta.width
    canvas.height = data.meta.height
    const ctx = canvas.getContext('2d')!
    const image = ctx.createImageData(canvas.width, canvas.height)
    const low = hexToRgb(cssVar('--c-earth')),
      high = hexToRgb(cssVar('--c-warn')),
      yes = hexToRgb(cssVar('--c-both')),
      none = hexToRgb(cssVar('--c-none'))
    for (let i = 0; i < data.slope.length; i++) {
      const v = valuesAtIndex(data, i),
        state = classify(v.slope, v.roughness, criteria)
      const value = layer === 'slope' ? v.slope : v.roughness
      const t = value === null ? 0 : Math.max(0, Math.min(1, value / (layer === 'slope' ? 30 : 1)))
      const rgb =
        layer === 'hazard'
          ? state === 'meets'
            ? yes
            : state === 'exceeds'
              ? high
              : none
          : value === null
            ? none
            : low.map((c, j) => Math.round(c * (1 - t) + high[j] * t))
      image.data.set([...rgb, 255], i * 4)
    }
    ctx.putImageData(image, 0, 0)
    const result = new THREE.CanvasTexture(canvas)
    result.colorSpace = THREE.SRGBColorSpace
    result.minFilter = THREE.NearestFilter
    result.magFilter = THREE.NearestFilter
    result.generateMipmaps = false
    result.repeat.set((canvas.width - 1) / canvas.width, (canvas.height - 1) / canvas.height)
    result.offset.set(0.5 / canvas.width, 0.5 / canvas.height)
    return result
    // Theme is a DOM token dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, layer, criteria, theme])
  useEffect(
    () => () => {
      texture?.dispose()
    },
    [texture],
  )
  return texture
}

/** Reject a scientific layer that does not share the elevation asset's grid origin, extent and source hash. */
export function hazardAligned(
  d: HazardData,
  a: {
    meta: { x0: number; y0: number; dx: number; dy: number; width: number; height: number; sources: Record<string, { sha256: string }> }
  },
) {
  return (
    d.meta.x0 === a.meta.x0 &&
    d.meta.y0 === a.meta.y0 &&
    d.meta.sourceSha256 === a.meta.sources.surf.sha256 &&
    (d.meta.width - 1) * d.meta.dx === (a.meta.width - 1) * a.meta.dx &&
    (d.meta.height - 1) * d.meta.dy === (a.meta.height - 1) * a.meta.dy
  )
}
