import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { starsMoonME, sunEclipticLongitude } from './stars'

const cat = JSON.parse(readFileSync(resolve(__dirname, '../../public/textures/stars_bsc5.json'), 'utf8')) as { stars: number[][] }

it('loads the NASA HEASARC bright-star catalogue with sane values (Sirius is the brightest)', () => {
  expect(cat.stars.length).toBeGreaterThan(8000)
  const sirius = cat.stars.reduce((a, b) => (b[2] < a[2] ? b : a))
  expect(sirius[0]).toBeCloseTo(101.29, 0) // RA (deg)
  expect(sirius[1]).toBeCloseTo(-16.72, 0) // Dec (deg)
})

it('puts a star at the Sun’s ecliptic longitude on the ephemeris Sun direction', () => {
  const t = Date.parse('2026-11-22T01:00:00Z')
  const lam = sunEclipticLongitude(t)
  // the ecliptic point at longitude lam, converted to RA/Dec
  const e = (23.4393 * Math.PI) / 180
  const ra = (Math.atan2(Math.sin(lam) * Math.cos(e), Math.cos(lam)) * 180) / Math.PI
  const dec = (Math.asin(Math.sin(lam) * Math.sin(e)) * 180) / Math.PI
  const sun: [number, number, number] = [0.3, -0.95, 0.02]
  const n = Math.hypot(...sun)
  const v = starsMoonME([[ra, dec, 0, 0]], [sun[0] / n, sun[1] / n, sun[2] / n], t)
  expect(Math.atan2(v[1], v[0])).toBeCloseTo(Math.atan2(sun[1], sun[0]), 6)
  expect(Math.abs(v[2])).toBeLessThan(1e-6)
  expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 6)
})
