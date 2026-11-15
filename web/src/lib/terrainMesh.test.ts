import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  meshArrays,
  localToSurface,
  surfaceToLocal,
  sampleGrid,
  terrainSiteFor,
  validateTerrain,
  type TerrainAsset,
  type TerrainSiteInfo,
} from './terrainMesh'
import { polarLatLon } from './terrain'
import { DEFAULT_STATE, fromHash, toHash } from './state'
const base = new URL('../../public/data/terrain/site01/', import.meta.url)
const meta = JSON.parse(readFileSync(new URL('terrain.json', base), 'utf8'))
const load = (file: string) => {
  const b = readFileSync(new URL(file, base))
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
}
const asset: TerrainAsset = { meta, heights: load('elevation.f32'), errors: load('uncertainty.f32'), imageUrl: null }
const arrays = meshArrays(asset)
describe('real NASA Site01 terrain', () => {
  it('verifies checked-in asset checksums and native metadata', () => {
    validateTerrain(asset)
    for (const a of [...Object.values(meta.assets), meta.imagery] as { file: string; sha256: string }[])
      expect(
        createHash('sha256')
          .update(readFileSync(new URL(a.file, base)))
          .digest('hex'),
      ).toBe(a.sha256)
    expect(meta.sources.surf.metadata.resolutionM).toEqual([5, 5])
    expect(meta.sources.surf.metadata.width).toBe(3200)
  })
  it('matches independent native-source checkpoints throughout the subset', () => {
    for (const p of meta.alignment.checkpoints) {
      expect(asset.heights[p.row * meta.width + p.col]).toBeCloseTo(p.elevationM, 5)
      expect(sampleGrid(asset, p.lat, p.lon)).toBeCloseTo(p.elevationM, 5)
      expect(p.projectionErrorM).toBeLessThan(1e-6)
    }
    expect(sampleGrid(asset, -89.53432, 209.94767)).toBeGreaterThan(1600)
    expect(sampleGrid(asset, -89.53432, 209.94767)).toBeLessThan(1700)
  })
  it('round trips curved mesh positions and radial heights at real vertices', () => {
    for (const p of meta.alignment.checkpoints) {
      const ll = polarLatLon(meta.x0 + p.col * meta.dx, meta.y0 + p.row * meta.dy)
      const point = { ...ll, elevationM: p.elevationM },
        local = surfaceToLocal(point, arrays.origin),
        result = localToSurface(local, arrays.origin)
      expect(result.lat).toBeCloseTo(p.lat, 9)
      expect(result.lon).toBeCloseTo(p.lon, 9)
      expect(result.elevationM).toBeCloseTo(point.elevationM, 6)
      const i = p.row * meta.width + p.col
      expect(Math.hypot(...local.map((n, j) => n - arrays.positions[i * 3 + j]))).toBeLessThan(0.002)
    }
    expect(arrays.indices.length).toBe(400 * 400 * 6)
  })
  it('excludes NoData triangles and rejects out-of-coverage or wrong-planet data', () => {
    const missing = asset.heights.slice()
    missing[0] = NaN
    const next = meshArrays({ ...asset, heights: missing })
    expect(next.indices[0]).not.toBe(0)
    expect(next.indices.length).toBe(arrays.indices.length - 3)
    const ll = polarLatLon(meta.x0, meta.y0)
    expect(sampleGrid({ ...asset, heights: missing }, ll.lat, ll.lon)).toBeNull()
    expect(sampleGrid(asset, 0, 0)).toBeNull()
    expect(() => validateTerrain({ ...asset, meta: { ...meta, radiusM: 6378137 } })).toThrow()
    expect(() => validateTerrain({ ...asset, heights: missing.slice(1) })).toThrow()
  })
  it('retains measured source RMS separately from rendering residuals', () => {
    expect(sampleGrid(asset, meta.origin.lat, meta.origin.lon, asset.errors)).toBeGreaterThan(0)
    expect(meta.decimationResidualM.samples).toBe(1601 * 1601)
    expect(meta.decimationResidualM.rms).toBeGreaterThan(0)
  })
  it('maps imagery UV edges to the exact projected vertex bounds', () => {
    const p = JSON.parse(readFileSync(new URL('imagery-provenance.json', base), 'utf8'))
    expect(p.targetBounds).toEqual([meta.x0, meta.y0 + 400 * meta.dy, meta.x0 + 400 * meta.dx, meta.y0])
    expect(Array.from(arrays.uv.slice(0, 2))).toEqual([0, 1])
    expect(Array.from(arrays.uv.slice(-2))).toEqual([1, 0])
  })
  it('round trips shared terrain workspace and landing-site selection', () => {
    const s = { ...DEFAULT_STATE, ws: 'terrain' as const, surfaceSite: 'B' as const }
    expect(fromHash(toHash(s))).toEqual(s)
  })
  it('matches independent native GeoTIFF reference samples at fractional lunar coordinates', () => {
    const reference = JSON.parse(readFileSync(new URL('../../../docs/data/SITE01_SAMPLE_REFERENCE.json', import.meta.url), 'utf8'))
    expect(reference.sourceSha256).toBe(meta.sources.surf.sha256)
    expect(reference.points).toHaveLength(101)
    for (const p of reference.points) {
      expect(sampleGrid(asset, p.lat, p.lon)).toBeCloseTo(p.mesh20mBilinearM, 5)
      expect(Math.abs(sampleGrid(asset, p.lat, p.lon)! - p.native5mBilinearM)).toBeLessThan(meta.decimationResidualM.maxAbs + 0.02)
    }
  })
})

describe('processed terrain site lookup (Milestone 3)', () => {
  const index = JSON.parse(readFileSync('public/data/terrain/index.json', 'utf8')) as { sites: TerrainSiteInfo[] }
  it('links planner sites first, then crop extent, and never extrapolates', () => {
    expect(index.sites.map((t) => t.id)).toEqual(['site01', 'site04', 'site06'])
    expect(terrainSiteFor(index.sites, 'nobile-rim-1-site06', 0, 0)?.id).toBe('site06')
    expect(terrainSiteFor(index.sites, 'custom:x', -89.5343, 209.9477)?.id).toBe('site01')
    const s6 = index.sites[2]
    expect(terrainSiteFor(index.sites, 'custom:y', s6.centre.lat, s6.centre.lon)?.id).toBe('site06')
    expect(terrainSiteFor(index.sites, 'apollo-11', 0.67409, 23.47298)).toBeNull()
    expect(terrainSiteFor(index.sites, 'custom:z', -85.0, 37.37)).toBeNull() // ~50 km outside the Site06 crop
  })
  it('every planner-linked terrain site exists in the planner catalogue at its crop centre', () => {
    const planner = JSON.parse(readFileSync('public/data/sites.json', 'utf8')) as { sites: { id: string; lat: number; lon: number }[] }
    for (const t of index.sites) {
      const p = planner.sites.find((s) => s.id === t.plannerId)!
      expect(p).toBeTruthy()
      expect(Math.abs(p.lat - t.centre.lat)).toBeLessThan(1e-5)
      expect(Math.abs(((p.lon - t.centre.lon + 540) % 360) - 180)).toBeLessThan(1e-5)
    }
  })
  it('Site04 and Site06 assets carry their own site id, product and identical method parameters', () => {
    for (const id of ['site04', 'site06']) {
      const m = JSON.parse(readFileSync(`public/data/terrain/${id}/terrain.json`, 'utf8'))
      const h = JSON.parse(readFileSync(`public/data/terrain/${id}/hazards/hazards.json`, 'utf8'))
      expect(m.siteId).toBe(id)
      expect([m.width, m.height, m.dx, m.dy, m.sourceResolutionM]).toEqual([401, 401, 20, -20, 5])
      expect([h.width, h.height, h.dx, h.dy, h.slopeSupportM, h.roughnessSupportM, h.quantum, h.noData]).toEqual([
        1601, 1601, 5, -5, 15, 25, 0.001, 65535,
      ])
      expect(h.sourceSha256).toBe(m.sources.surf.sha256)
      expect([h.x0 - m.x0, h.y0 - m.y0]).toEqual([0, 0])
    }
  })
})
