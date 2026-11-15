// End-to-end physics check of the browser code path against JPL Horizons reference values
// (fixture produced by pipeline/validation_table.py) and the shipped ephemeris file.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildEphemeris } from './data'
import type { EphemMeta, Site } from './data'
import { makeCtx, nextEvent, sampleAt, summarizeSamples, series } from './analysis'
import ref from './__fixtures__/horizons_reference.json'

const dataDir = resolve(__dirname, '../../public/data')
const meta = JSON.parse(readFileSync(resolve(dataDir, 'ephem.json'), 'utf8')) as EphemMeta
const buf = readFileSync(resolve(dataDir, 'ephem.bin'))
const rows = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
const eph = buildEphemeris(meta, rows)
const sites = JSON.parse(readFileSync(resolve(dataDir, 'sites.json'), 'utf8')) as { azStepDeg: number; sites: Site[] }

const flatSite = (lat: number, lon: number): Site => ({
  id: 'flat',
  name: 'flat',
  group: 'test',
  lat,
  lon,
  source: 'test',
  verify: false,
  elevationM: 0,
  horizon: new Array(720).fill(-90),
})

describe('Sun/Earth elevation vs JPL Horizons (3 sites × 3 times)', () => {
  for (const r of ref.rows) {
    it(`${r.site} at ${r.utc}`, () => {
      const ctx = makeCtx(flatSite(r.lat, r.lon), 0.5)
      const s = sampleAt(ctx, eph, Date.parse(r.utc))
      expect(Math.abs(s.sunEl - r.horizons.sunEl)).toBeLessThan(0.01)
      expect(Math.abs(s.earthEl - r.horizons.earthEl)).toBeLessThan(0.01)
    })
  }
})

describe('data contract', () => {
  it('stores longitudes east-positive 0..360 and cites every site', () => {
    for (const s of sites.sites) {
      expect(s.lon).toBeGreaterThanOrEqual(0)
      expect(s.lon).toBeLessThan(360)
      expect(s.source.length).toBeGreaterThan(5)
      expect(s.horizon).toHaveLength(360 / sites.azStepDeg)
    }
  })
})

describe('real sites', () => {
  const site = (id: string) => sites.sites.find((s) => s.id === id)!

  it('Shackleton crater floor is permanently shadowed over a full year', () => {
    const ctx = makeCtx(site('shackleton-floor'), sites.azStepDeg)
    const t0 = Date.parse('2027-01-01T00:00:00Z')
    const t1 = t0 + 365 * 86_400_000
    const sum = summarizeSamples(series(ctx, eph, t0, t1 - 1, 6), 6 * 3_600_000)
    expect(sum.sunPct).toBe(0)
  })

  it('Chandrayaan-3: predicted sunset falls on 2023-09-04 (end of surface operations)', () => {
    const ctx = makeCtx(site('chandrayaan-3'), sites.azStepDeg)
    const ev = nextEvent(ctx, eph, Date.parse('2023-08-23T12:34:00Z'), 'sun')
    expect(ev.kind).toBe('Sunset')
    expect(new Date(ev.time!).toISOString().slice(0, 10)).toBe('2023-09-04')
  })

  it('IM-2 at 2026-11-14 12:00 UTC: Sun above the smooth horizon but hidden by terrain', () => {
    const ctx = makeCtx(site('im-2'), sites.azStepDeg)
    const s = sampleAt(ctx, eph, Date.parse('2026-11-14T12:00:00Z'))
    expect(s.sunEl).toBeGreaterThan(1)
    expect(s.sunUpper).toBeLessThan(0)
    expect(s.sunFrac).toBe(0)
  })
})
