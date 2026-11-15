import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { analysisAt, classify, footprint, valuesAtIndex, type HazardData } from './hazardAnalysis'
import { polarLatLon } from './terrain'
const base = new URL('../../public/data/terrain/site01/hazards/', import.meta.url)
const meta = JSON.parse(readFileSync(new URL('hazards.json', base), 'utf8'))
function load(key: string) {
  const b = readFileSync(new URL(key + '.u16', base))
  return new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
}
const d: HazardData = { meta, slope: load('slope'), roughness: load('roughness') }
describe('native-resolution hazard screening', () => {
  it('classifies exceedances, equality and missing/invalid criteria separately', () => {
    expect(classify(10, 0.3, { slope: 10, roughness: 0.3 })).toBe('meets')
    expect(classify(11, 0.3, { slope: 10, roughness: 0.3 })).toBe('exceeds')
    expect(classify(null, 0, { slope: 10, roughness: 1 })).toBe('insufficient')
    expect(classify(0, 0, { slope: NaN, roughness: 1 })).toBe('insufficient')
  })
  it('matches independent source raster points within half a quantization unit', () => {
    for (const p of meta.points) {
      const ll = polarLatLon(meta.x0 + p.col * 5, meta.y0 - p.row * 5),
        v = analysisAt(d, ll.lat, ll.lon)
      expect(v.row).toBe(p.row)
      expect(v.col).toBe(p.col)
      expect(Math.abs(v.slope! - p.slope)).toBeLessThanOrEqual(0.000501)
      expect(Math.abs(v.roughness! - p.roughness)).toBeLessThanOrEqual(0.000501)
    }
  })
  it('samples a disk, reports min/max and changes classifications without changing coverage', () => {
    const ll = polarLatLon(meta.x0 + 4000, meta.y0 - 4000)
    const a = footprint(d, ll.lat, ll.lon, 100, 1653, { slope: 90, roughness: 10 })!
    const b = footprint(d, ll.lat, ll.lon, 100, 1653, { slope: 0, roughness: 0 })!
    expect(a.total).toBeLessThan(41 * 41)
    expect(a.valid).toBe(a.total)
    expect(a.meetsPct).toBe(100)
    expect(b.meetsPct).toBe(0)
    expect(a.slope!.max).toBeGreaterThanOrEqual(a.slope!.mean)
    expect(footprint(d, ll.lat, ll.lon, 200, 1653, { slope: 10, roughness: 1 })!.total).toBeGreaterThan(a.total)
  })
  it('counts clipped footprint data as unavailable and never clamps remote points', () => {
    const ll = polarLatLon(meta.x0, meta.y0)
    const a = footprint(d, ll.lat, ll.lon, 100, 1000, { slope: 90, roughness: 10 })!
    expect(a.coveragePct).toBeLessThan(30)
    expect(a.valid).toBeGreaterThan(0)
    expect(analysisAt(d, 0, 0).slope).toBeNull()
    expect(valuesAtIndex({ ...d, slope: new Uint16Array([65535]) }, 0).slope).toBeNull()
  })
})
