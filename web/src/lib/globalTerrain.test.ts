import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { globalElevation, lunarDisplayRadius } from './globalTerrain'
import type { GlobalDem } from './globalTerrain'
const toy: GlobalDem = {
  meta: { rows: 2, cols: 4, ppd: 1 / 90, source: 'synthetic unit fixture' },
  h: new Int16Array([0, 10, 20, 30, 100, 110, 120, 130]),
}
describe('real global LOLA shape', () => {
  it('samples cell centres, interpolates latitude and wraps the longitude seam', () => {
    expect(globalElevation(toy, 45, 45)).toBe(0)
    expect(globalElevation(toy, -45, 135)).toBe(110)
    expect(globalElevation(toy, 0, 90)).toBe(55)
    expect(globalElevation(toy, 45, 0)).toBe(15)
    expect(globalElevation(toy, 45, 360)).toBe(15)
    expect(globalElevation(toy, 45, -45)).toBe(30)
  })
  it('closes both poles with one elevation independent of longitude', () => {
    expect(globalElevation(toy, 90, 0)).toBe(15)
    expect(globalElevation(toy, 90, 240)).toBe(15)
    expect(globalElevation(toy, -90, 0)).toBe(115)
  })
  it('keeps the real lunar radial scale and rejects invented/nonfinite inputs', () => {
    expect(lunarDisplayRadius(1737.4)).toBeCloseTo(1.001, 12)
    expect(lunarDisplayRadius(-1737.4)).toBeCloseTo(0.999, 12)
    expect(() => lunarDisplayRadius(NaN)).toThrow()
    expect(() => globalElevation(toy, 91, 0)).toThrow()
  })
  it('recovers real shipped LOLA cells at their geographic centres in both hemispheres', () => {
    const buf = readFileSync(new URL('../../public/data/dem_global.bin', import.meta.url))
    const dem: GlobalDem = {
      meta: { rows: 720, cols: 1440, ppd: 4, source: 'NASA LOLA LDEM_16' },
      h: new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2),
    }
    for (const [r, c] of [
      [0, 0],
      [719, 1439],
      [350, 720],
      [530, 23],
      [100, 1090],
    ]) {
      const h = globalElevation(dem, 90 - (r + 0.5) / 4, (c + 0.5) / 4)
      expect(h).toBe(dem.h[r * 1440 + c])
      expect(lunarDisplayRadius(h) * 1737400 - 1737400).toBeCloseTo(h, 5)
    }
  })
})
