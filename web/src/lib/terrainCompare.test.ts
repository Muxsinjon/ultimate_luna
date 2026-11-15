import { describe, expect, it } from 'vitest'
import { footprint, type HazardData } from './hazardAnalysis'
import { compareFootprints, footprintDetail, screenFootprint, SLOPE_BINS } from './terrainCompare'
import { polarLatLon } from './terrain'
import type { TerrainAsset } from './terrainMesh'

// Synthetic native grid: 41 x 41 samples at 5 m, centred on a polar stereographic point near Site01.
const N = 41
const X0 = -7100
const Y0 = -12100
function hazards(slopeAt: (r: number, c: number) => number | null, rough = 0.1): HazardData {
  const slope = new Uint16Array(N * N)
  const roughness = new Uint16Array(N * N)
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const s = slopeAt(r, c)
      slope[r * N + c] = s === null ? 65535 : Math.round(s * 1000)
      roughness[r * N + c] = s === null ? 65535 : Math.round(rough * 1000)
    }
  return {
    meta: {
      version: 1,
      width: N,
      height: N,
      x0: X0,
      y0: Y0,
      dx: 5,
      dy: -5,
      quantum: 0.001,
      noData: 65535,
      officialComparison: { rmsDifferenceDeg: 0, maxAbsDifferenceDeg: 0 },
      slopeSupportM: 15,
      roughnessSupportM: 25,
      sourceSha256: 'x',
      assets: { slope: { file: '', sha256: '' }, roughness: { file: '', sha256: '' } },
    },
    slope,
    roughness,
  }
}
// matching 20 m grid (11 x 11) over the same area
const asset = {
  meta: { width: 11, height: 11, x0: X0, y0: Y0, dx: 20, dy: -20 },
  heights: Float32Array.from({ length: 121 }, (_, i) => 1000 + i),
  errors: Float32Array.from({ length: 121 }, () => 0.4),
} as unknown as TerrainAsset
const centre = polarLatLon(X0 + 100, Y0 - 100) // grid centre: native (20, 20)
const crit = { slope: 10, roughness: 0.3 }

describe('equal-footprint terrain comparison', () => {
  it('uses exactly the Milestone 2 footprint inclusion and counts', () => {
    const hz = hazards((r) => (r < 20 ? 5 : 15))
    for (const radius of [5, 20, 47, 90]) {
      const base = footprint(hz, centre.lat, centre.lon, radius, 0, crit)!
      const d = footprintDetail(hz, asset, centre, 0, radius, crit)!
      expect([d.total, d.valid, d.meets, d.meetsPct]).toEqual([base.total, base.valid, base.meets, base.meetsPct])
      expect(d.slopeHistogram.reduce((s, x) => s + x, 0)).toBe(d.valid)
      expect(d.exceedSlope).toBe(d.valid - d.meets)
      expect(d.sampleAreaM2).toBe(d.valid * 25)
    }
  })
  it('summarises slope distribution and the 20 m elevation/uncertainty in the same disk', () => {
    const d = footprintDetail(
      hazards(() => 12.5),
      asset,
      centre,
      0,
      50,
      crit,
    )!
    expect(d.slope).toEqual({ min: 12.5, p50: 12.5, p90: 12.5, mean: 12.5, max: 12.5 })
    expect(d.slopeHistogram[SLOPE_BINS.indexOf(10)]).toBe(d.valid)
    expect(d.elevation!.samples).toBeGreaterThan(0)
    expect(d.uncertaintyMedianM).toBeCloseTo(0.4, 6)
  })
  it('screens with three explicit states and decisive reasons', () => {
    const flat = footprintDetail(
      hazards(() => 2),
      asset,
      centre,
      0,
      50,
      crit,
    )
    expect(screenFootprint(flat, crit, 90).status).toBe('meets')
    const steep = footprintDetail(
      hazards((r) => (r % 2 ? 20 : 2)),
      asset,
      centre,
      0,
      50,
      crit,
    )
    const s = screenFootprint(steep, crit, 90)
    expect(s.status).toBe('fails')
    expect(s.reasons.join(' ')).toMatch(/steeper than 10°/)
    const hole = footprintDetail(
      hazards((r, c) => (r === 20 && c === 20 ? null : 2)),
      asset,
      centre,
      0,
      50,
      crit,
    )
    expect(screenFootprint(hole, crit, 90).status).toBe('insufficient')
    expect(screenFootprint(null, crit, 90).status).toBe('insufficient')
    expect(screenFootprint(flat, { slope: Number.NaN, roughness: 0.3 }, 90).status).toBe('insufficient')
  })
  it('treats footprints running off the raster edge as insufficient, never favourable', () => {
    const corner = polarLatLon(X0, Y0)
    const d = footprintDetail(
      hazards(() => 1),
      asset,
      corner,
      0,
      50,
      crit,
    )!
    expect(d.valid).toBeLessThan(d.total)
    expect(screenFootprint(d, crit, 50).status).toBe('insufficient')
  })
  it('explains trade-offs and says plainly when neither site meets the criteria', () => {
    const mk = (name: string, slope: number) => {
      const detail = footprintDetail(
        hazards(() => slope),
        asset,
        centre,
        0,
        50,
        crit,
      )
      return { name, detail, screening: screenFootprint(detail, crit, 90) }
    }
    const t1 = compareFootprints(mk('A', 3), mk('B', 15)).join(' ')
    expect(t1).toMatch(/Only A meets/)
    expect(t1).toMatch(/B is steeper/)
    const t2 = compareFootprints(mk('A', 15), mk('B', 20)).join(' ')
    expect(t2).toMatch(/Neither footprint meets/)
    expect(t2).toMatch(/not a landing-safety assessment/)
    const t3 = compareFootprints(mk('A', 3), mk('B', 3)).join(' ')
    expect(t3).toMatch(/Both footprints meet/)
    expect(t3).toMatch(/tied/)
  })
})
