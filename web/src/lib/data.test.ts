import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildEphemeris, validateSites, type EphemMeta, type SitesFile } from './data'
const meta: EphemMeta = {
  startUtc: '2027-01-01T00:00:00Z',
  startMs: Date.parse('2027-01-01T00:00:00Z'),
  stepMs: 3600000,
  count: 2,
  moonRadiusKm: 1737.4,
  sunRadiusKm: 695700,
  earthRadiusKm: 6371,
  meanSunDistanceKm: 149597870,
  source: 'fixture',
}
const raw = () => new Float32Array([384000, 0, 0, 1, 0, 0, 384001, 0, 0, 1, 0, 0])
it('rejects missing, corrupt, or mis-sampled observations before visibility can be computed', () => {
  expect(buildEphemeris(meta, raw()).endMs).toBe(meta.startMs + 3600000)
  const nan = raw()
  nan[2] = NaN
  expect(() => buildEphemeris(meta, nan)).toThrow(/nonfinite/)
  expect(() => buildEphemeris({ ...meta, stepMs: 1800000 }, raw())).toThrow(/hourly/)
  expect(() => buildEphemeris({ ...meta, startUtc: 'invalid' }, raw())).toThrow()
  const wrong = raw()
  wrong[0] = 384
  expect(() => buildEphemeris(meta, wrong)).toThrow(/units/)
  expect(() => buildEphemeris(meta, raw().slice(0, 6))).toThrow(/incomplete/)
})
it('validates sourced site coordinates and complete finite horizon masks', () => {
  const file = JSON.parse(readFileSync(new URL('../../public/data/sites.json', import.meta.url), 'utf8')) as SitesFile
  expect(() => validateSites(file)).not.toThrow()
  const bad = structuredClone(file)
  bad.sites[0].lat = 91
  expect(() => validateSites(bad)).toThrow()
  bad.sites[0] = structuredClone(file.sites[0])
  bad.sites[0].horizon[1] = NaN
  expect(() => validateSites(bad)).toThrow()
})
