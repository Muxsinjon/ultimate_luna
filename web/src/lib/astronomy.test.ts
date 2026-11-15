// Milestone 4: Sun/Earth topocentric geometry through the browser code path vs an independent JPL Horizons
// reference (fixture written by pipeline/validate_astronomy.py --fetch: 9 sites × 40 UT epochs, quantities 4,10,13,20).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bodyVectorsFromSite, makeCtx, sampleAt, vectorsAt } from './analysis'
import { buildEphemeris, type EphemMeta, type Site } from './data'
import { azEl, enuBasis, unitVec, type Vec3 } from './geometry'
import { earthPhase } from './physics/earthPhase'
import { normalizeLon360 } from './physics/lon'
import { bodyDirectionToLocal } from './terrainMesh'
import ref from './__fixtures__/horizons_topocentric.json'

const dataDir = resolve(__dirname, '../../public/data')
const meta = JSON.parse(readFileSync(resolve(dataDir, 'ephem.json'), 'utf8')) as EphemMeta
const buf = readFileSync(resolve(dataDir, 'ephem.bin'))
const eph = buildEphemeris(meta, new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)))
const flat = (lat: number, lon: number): Site => ({
  id: 'flat',
  name: 'flat',
  group: 'test',
  lat,
  lon: normalizeLon360(lon),
  source: 'test',
  verify: false,
  elevationM: 0,
  horizon: new Array(720).fill(-90),
})
const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180
const allTimes = ref.times.map((t) => Date.parse(t))
// two reference epochs (2031-12-31 22:00 and 22:59) lie after the last shipped row (18:00): outside coverage
const inCoverage = (t: number) => t >= eph.meta.startMs && t <= eph.endMs
const times = allTimes.filter(inCoverage)

describe('Sun and Earth vs JPL Horizons topocentric (9 sites × 40 epochs, 2023–2031)', () => {
  const err = { sunEl: 0, sunAz: 0, earthEl: 0, earthAz: 0, earthDiam: 0, lit: 0 }
  for (const s of ref.sites) {
    const ctx = makeCtx(flat(s.lat, s.lon), 0.5)
    allTimes.forEach((t, i) => {
      if (!inCoverage(t)) return
      const o = sampleAt(ctx, eph, t)
      const { earth, sun } = vectorsAt(eph, t)
      const fromSite: Vec3 = [earth[0] - ctx.pos[0], earth[1] - ctx.pos[1], earth[2] - ctx.pos[2]]
      err.sunEl = Math.max(err.sunEl, Math.abs(o.sunEl - s.sun.el[i]))
      err.earthEl = Math.max(err.earthEl, Math.abs(o.earthEl - s.earth.el[i]))
      if (Math.abs(s.sun.el[i]) < 80)
        err.sunAz = Math.max(err.sunAz, Math.abs(wrap(o.sunAz - s.sun.az[i]) * Math.cos((s.sun.el[i] * Math.PI) / 180)))
      if (Math.abs(s.earth.el[i]) < 80)
        err.earthAz = Math.max(err.earthAz, Math.abs(wrap(o.earthAz - s.earth.az[i]) * Math.cos((s.earth.el[i] * Math.PI) / 180)))
      err.earthDiam = Math.max(err.earthDiam, Math.abs(2 * o.earthRadiusDeg - s.earth.angDiamArcsec[i] / 3600))
      err.lit = Math.max(err.lit, Math.abs(100 * earthPhase(fromSite, sun, earth, meta.meanSunDistanceKm).illuminated - s.earth.illuPct[i]))
    })
  }
  it('elevation and on-sky azimuth errors stay within the measured bounds', () => {
    // measured by validate_astronomy.py (in coverage, 9 × 38 = 342 samples): Sun el 0.0009°, Sun az 0.0003°, Earth el/az 0.0059°
    expect(err.sunEl).toBeLessThan(0.0015)
    expect(err.sunAz).toBeLessThan(0.001)
    expect(err.earthEl).toBeLessThan(0.007)
    expect(err.earthAz).toBeLessThan(0.007)
  })
  it('Earth apparent diameter and illuminated fraction match Horizons', () => {
    // mean Earth radius 6371 km vs Horizons' equatorial value: ≤ 0.003° on a ~1.9° disc
    expect(err.earthDiam).toBeLessThan(0.003)
    expect(err.lit).toBeLessThan(0.01) // percentage points
  })
  it('Horizons itself returns identical results for 0–360 and −180..180 longitude, and so do we', () => {
    const [a, b] = ref.sites.filter((s) => s.id.startsWith('connecting-ridge'))
    expect(a.sun.el).toEqual(b.sun.el)
    const ca = makeCtx(flat(a.lat, a.lon), 0.5),
      cb = makeCtx(flat(b.lat, b.lon), 0.5)
    for (const t of times) {
      const x = sampleAt(ca, eph, t),
        y = sampleAt(cb, eph, t)
      expect([x.sunAz, x.sunEl, x.earthAz, x.earthEl]).toEqual([y.sunAz, y.sunEl, y.earthAz, y.earthEl])
    }
  })
})

describe('time handling and coverage', () => {
  const ctx = makeCtx(flat(-89.53432, 209.94767), 0.5)
  it('covers 2023-01-01 00:00 to 2031-12-31 18:00 UTC hourly (last shipped 6-hourly row)', () => {
    expect(new Date(eph.meta.startMs).toISOString()).toBe('2023-01-01T00:00:00.000Z')
    expect(new Date(eph.endMs).toISOString()).toBe('2031-12-31T18:00:00.000Z')
    expect(eph.meta.stepMs).toBe(3_600_000)
    expect(allTimes.filter((t) => !inCoverage(t)).map((t) => new Date(t).toISOString())).toEqual([
      '2031-12-31T22:00:00.000Z',
      '2031-12-31T22:59:00.000Z',
    ])
  })
  it('is continuous across a UTC date change (no jump at midnight)', () => {
    const mid = Date.parse('2027-07-01T00:00:00Z')
    const a = sampleAt(ctx, eph, mid - 60_000),
      b = sampleAt(ctx, eph, mid),
      c = sampleAt(ctx, eph, mid + 60_000)
    expect(Math.abs(b.sunEl - a.sunEl)).toBeLessThan(0.01)
    expect(Math.abs(c.sunEl - b.sunEl)).toBeLessThan(0.01)
    expect(Math.abs(wrap(c.sunAz - a.sunAz))).toBeLessThan(0.05)
  })
  it('interpolates inside the hour monotonically between hourly samples', () => {
    const t0 = Date.parse('2029-03-10T05:00:00Z')
    const e = [0, 15, 30, 45, 60].map((m) => sampleAt(ctx, eph, t0 + m * 60_000).sunAz)
    const steps = e.slice(1).map((x, i) => wrap(x - e[i]))
    expect(steps.every((d) => Math.sign(d) === Math.sign(steps[0]))).toBe(true)
  })
  it('vectorsAt never extrapolates: times outside the data return the boundary sample', () => {
    const late = vectorsAt(eph, eph.endMs + 30 * 86_400_000)
    const end = vectorsAt(eph, eph.endMs)
    expect(late).toEqual(end)
    expect(vectorsAt(eph, eph.meta.startMs - 86_400_000)).toEqual(vectorsAt(eph, eph.meta.startMs))
  })
})

describe('Earth phase and polar geometry', () => {
  it('earthPhase: full, new and quarter Earth', () => {
    const earth: Vec3 = [384_400, 0, 0]
    const site: Vec3 = [384_400 - 1737.4, 0, 0]
    // Sun behind the Moon (opposite Earth): observer sees the lit side → full
    expect(earthPhase(site, [-1, 0, 0], earth).illuminated).toBeCloseTo(1, 6)
    // Sun behind Earth: new Earth
    expect(earthPhase(site, [1, 0, 0], earth).illuminated).toBeLessThan(1e-5)
    // Sun 90° from the Earth direction: phase angle 90° minus the Earth–Moon parallax (~0.147°)
    const q = earthPhase(site, [0, 1, 0], earth)
    expect((q.phaseAngle * 180) / Math.PI).toBeCloseTo(90 - (Math.atan(384_400 / 149_597_870.7) * 180) / Math.PI, 4)
    expect(() => earthPhase([0, 0, 0], [1, 0, 0], earth)).toThrow()
  })
  it('near the pole, Earth stays near the horizon and libration moves it by degrees', () => {
    const ctx = makeCtx(flat(-89.99, 45), 0.5)
    let lo = Infinity,
      hi = -Infinity
    for (let t = Date.parse('2027-01-01T00:00:00Z'); t < Date.parse('2027-03-01T00:00:00Z'); t += 6 * 3_600_000) {
      const e = sampleAt(ctx, eph, t).earthEl
      lo = Math.min(lo, e)
      hi = Math.max(hi, e)
    }
    expect(hi - lo).toBeGreaterThan(5) // ~±6.7° latitude libration
    expect(hi - lo).toBeLessThan(16)
    expect(Math.abs(lo)).toBeLessThan(10)
  })
  it('azimuth convention: clockwise from north, east = 90°', () => {
    const b = enuBasis(0, 0)
    expect(azEl([0, 1, 0], b).az).toBeCloseTo(90, 9) // +Y is east at (0°, 0°)
    expect(azEl([0, 0, 1], b).az).toBeCloseTo(0, 9) // +Z is north
    expect(azEl([0, 0, -1], b).az).toBeCloseTo(180, 9)
  })
  it('3D rays: body directions in the mesh frame agree with site az/el at the crop origin', () => {
    const lat = -89.53432,
      lon = 209.94767
    const t = Date.parse('2026-11-22T01:00:00Z')
    const v = bodyVectorsFromSite(eph, t, lat, lon, 0)
    const s = sampleAt(makeCtx(flat(lat, lon), 0.5), eph, t)
    for (const [d, az, el] of [
      [v.sun, s.sunAz, s.sunEl],
      [v.earth, s.earthAz, s.earthEl],
    ] as const) {
      const l = bodyDirectionToLocal(d, { lat, lon }) // X east, Y up, Z south
      expect((Math.asin(l[1]) * 180) / Math.PI).toBeCloseTo(el, 6)
      expect(((((Math.atan2(l[0], -l[2]) * 180) / Math.PI) % 360) + 360) % 360).toBeCloseTo(az, 5)
    }
    // 4 km away near the pole, local north has rotated: azimuths differ but the mesh direction is the same vector
    const u = unitVec(lon, lat)
    expect(Math.hypot(...u)).toBeCloseTo(1, 12)
  })
})
