import { describe, expect, it } from 'vitest'
import { SphereGeometry } from 'three'
import { globeCoordinates, globePoint, moonToGlobe } from './globe'
import { unitVec } from './geometry'

describe('whole-Moon location selection', () => {
  it('uses the lunar equator, north pole and east-positive cardinal directions', () => {
    expect(globePoint(0, 0)).toEqual([1, 0, -0])
    expect(globePoint(0, 90)[2]).toBeCloseTo(-1)
    expect(globePoint(90, 0)[1]).toBeCloseTo(1)
    expect(globePoint(-90, 0)[1]).toBeCloseTo(-1)
  })
  it('round-trips ray intersections across both hemispheres and the longitude seam', () => {
    for (const lat of [-89.9, -85.42, -30, 0, 51, 89.9]) {
      for (const lon of [0, 90, 180, 270, 359.999]) {
        const p = globeCoordinates(globePoint(lat, lon, 3.2))
        expect(p.lat).toBeCloseTo(lat, 8)
        expect(p.lon).toBeCloseTo(lon, 8)
      }
    }
    expect(globeCoordinates(globePoint(0, -90)).lon).toBeCloseTo(270)
    expect(() => globeCoordinates([0, 0, 0])).toThrow()
  })
  it('matches NASA texture coordinates (0° at centre, seam at 180°, north at top)', () => {
    const sphere = new SphereGeometry(1, 16, 8)
    const pos = sphere.getAttribute('position'),
      uv = sphere.getAttribute('uv')
    for (let i = 0; i < pos.count; i++) {
      const v = uv.getY(i)
      if (v === 0 || v === 1) continue // longitude has no unique value at a pole
      const p = globeCoordinates([pos.getX(i), pos.getY(i), pos.getZ(i)])
      expect(p.lat).toBeCloseTo(v * 180 - 90, 4)
      const expected = (((uv.getX(i) * 360 - 180) % 360) + 360) % 360
      expect(Math.abs(((p.lon - expected + 540) % 360) - 180)).toBeLessThan(0.0001)
    }
    sphere.dispose()
  })
  it('aligns solar directions with picked locations without changing lunar coordinates', () => {
    for (const [lat, lon] of [
      [0, 0],
      [-85, 30],
      [40, 210],
    ]) {
      const displayed = moonToGlobe(unitVec(lon, lat))
      globePoint(lat, lon).forEach((v, i) => expect(displayed[i]).toBeCloseTo(v, 12))
    }
  })
})
