// Milestone 5: browser terrain-shadow algorithm (20 m mesh + far-field grid) vs an independent native 5 m reference
// (pipeline/illumination_sites.py: native PGDA DEM to 25 km in 5 m steps + LOLA 240 m beyond, exact sphere).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { vectorsAt } from './analysis'
import { buildEphemeris, type EphemMeta } from './data'
import { discFractionAbove, SUN_RADIUS_DEG } from './physics/disc'
import {
  decodeFarField,
  edgeDistanceM,
  farHorizon,
  illuminationField,
  localHorizon,
  vertexVisibility,
  type IlluminationMeta,
} from './terrainShadow'
import type { TerrainAsset, TerrainMeta } from './terrainMesh'
import ref from './__fixtures__/shadow_reference.json'

const root = resolve(__dirname, '../../public/data')
const buf = (p: string) => {
  const b = readFileSync(resolve(root, p))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
}
const f32 = (p: string) => new Float32Array(buf(p))
function load(id: string) {
  const meta = JSON.parse(readFileSync(resolve(root, `terrain/${id}/terrain.json`), 'utf8')) as TerrainMeta
  const asset = {
    meta,
    heights: f32(`terrain/${id}/${meta.assets.surf.file}`),
    errors: f32(`terrain/${id}/${meta.assets.toterr.file}`),
    imageUrl: null,
  } as TerrainAsset
  const im = JSON.parse(readFileSync(resolve(root, `terrain/${id}/illumination/illumination.json`), 'utf8')) as IlluminationMeta
  const far = decodeFarField(im, buf(`terrain/${id}/illumination/far_el.i16`), buf(`terrain/${id}/illumination/far_d.u16`))
  const psr = new Uint8Array(buf(`terrain/${id}/illumination/psr.u8`))
  return { asset, far, im, psr }
}
const sites = { site01: load('site01'), site04: load('site04'), site06: load('site06') }
const ephMeta = JSON.parse(readFileSync(resolve(root, 'ephem.json'), 'utf8')) as EphemMeta
const eph = buildEphemeris(ephMeta, new Float32Array(buf('ephem.bin')))

const pct = (v: number[], q: number) => {
  const s = [...v].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]
}

describe('horizon accuracy vs native 5 m reference (36 vertices × 6 azimuths per site)', () => {
  const inner: number[] = [],
    edge: number[] = []
  for (const [id, pts] of Object.entries(ref.sites)) {
    const { asset, far } = sites[id as keyof typeof sites]
    for (const p of pts as { row: number; col: number; az: number[]; horizonDeg: number[] }[])
      p.az.forEach((az, k) => {
        const ours = Math.max(localHorizon(asset, p.row, p.col, az, 2), farHorizon(asset, far, p.row, p.col, az))
        ;(edgeDistanceM(asset, p.row, p.col) >= 1000 ? inner : edge).push(Math.abs(ours - p.horizonDeg[k]))
      })
  }
  it('inner region (≥ 1 km from the crop edge): bounded horizon error', () => {
    // measured values are reported in docs/MILESTONE5_ACCEPTANCE.md; bounds leave small headroom
    expect(inner.length).toBeGreaterThan(300)
    expect(pct(inner, 0.5)).toBeLessThan(0.15)
    expect(pct(inner, 0.95)).toBeLessThan(1.0)
  })
  it('edge band is reported separately (coarser outside-crop terrain)', () => {
    expect(edge.length).toBeGreaterThan(50)
    expect(pct(edge, 0.5)).toBeLessThan(0.5)
  })
})

describe('time-dependent shadow field', () => {
  it('PGDA permanently shadowed vertices are never sunlit across a full year (Site04, Shackleton)', () => {
    const { asset, far, psr } = sites.site04
    const idx: [number, number][] = []
    for (let r = 0; r < 401; r += 25)
      for (let c = 0; c < 401; c += 25) if (psr[r * 401 + c] === 1 && edgeDistanceM(asset, r, c) >= 1000) idx.push([r, c])
    expect(idx.length).toBeGreaterThan(20)
    let lit = 0
    for (let t = Date.parse('2027-01-01T00:00:00Z'); t < Date.parse('2028-01-01T00:00:00Z'); t += 61 * 3_600_000) {
      const { sun, earth } = vectorsAt(eph, t)
      for (const [r, c] of idx) if (vertexVisibility(asset, far, r, c, sun, earth).sunFrac > 0) lit++
    }
    expect(lit).toBe(0)
  })
  it('field uses the upper-limb rule and circular-segment disc fraction', () => {
    const { asset, far } = sites.site01
    const t = Date.parse('2026-11-22T01:00:00Z')
    const { sun, earth } = vectorsAt(eph, t)
    const v = vertexVisibility(asset, far, 200, 200, sun, earth)
    expect(v.sunFrac).toBeCloseTo(discFractionAbove(v.sunEl - v.sunHorizon, SUN_RADIUS_DEG), 12)
    expect(v.sunFrac > 0).toBe(v.sunEl - v.sunHorizon + SUN_RADIUS_DEG > 0)
    const field = illuminationField(asset, far, sun, earth, 20)
    expect(field.size).toBe(21)
    expect(field.sun[10 * 21 + 10]).toBeCloseTo(v.sunFrac, 12)
    expect(field.sunFullPct).toBeLessThanOrEqual(field.sunAnyPct)
  })
  it('crop centre agrees with the planner terrain-aware state most of the time (different terrain resolution)', () => {
    // Site01 crop centre = Connecting Ridge planner site; planner mask uses 240 m terrain only
    const { asset, far } = sites.site01
    const planner = JSON.parse(readFileSync(resolve(root, 'sites.json'), 'utf8')).sites.find(
      (s: { id: string }) => s.id === 'connecting-ridge',
    )
    let agree = 0,
      n = 0
    for (let t = Date.parse('2027-01-01T00:00:00Z'); t < Date.parse('2027-07-01T00:00:00Z'); t += 13 * 3_600_000) {
      const { sun, earth } = vectorsAt(eph, t)
      const v = vertexVisibility(asset, far, 200, 200, sun, earth)
      const step = 360 / planner.horizon.length
      const i = Math.round(v.sunAz / step) % planner.horizon.length
      const plannerLit = v.sunEl - planner.horizon[i] + SUN_RADIUS_DEG > 0
      if (plannerLit === v.sunFrac > 0) agree++
      n++
    }
    expect(agree / n).toBeGreaterThan(0.85)
  })
})

it('reports measured horizon errors', () => {
  const rows: string[] = []
  for (const [id, pts] of Object.entries(ref.sites)) {
    const { asset, far } = sites[id as keyof typeof sites]
    const inn: number[] = [],
      edg: number[] = [],
      sgn: number[] = []
    for (const p of pts as { row: number; col: number; az: number[]; horizonDeg: number[] }[])
      p.az.forEach((az, k) => {
        const o = Math.max(localHorizon(asset, p.row, p.col, az, 2), farHorizon(asset, far, p.row, p.col, az))
        ;(edgeDistanceM(asset, p.row, p.col) >= 1000 ? inn : edg).push(Math.abs(o - p.horizonDeg[k]))
        sgn.push(o - p.horizonDeg[k])
      })
    rows.push(
      `${id} inner n=${inn.length} p50=${pct(inn, 0.5).toFixed(3)} p95=${pct(inn, 0.95).toFixed(3)} max=${Math.max(...inn).toFixed(3)} | edge n=${edg.length} p50=${pct(edg, 0.5).toFixed(3)} p95=${pct(edg, 0.95).toFixed(3)} max=${Math.max(...edg).toFixed(3)} | bias=${(sgn.reduce((a, b) => a + b, 0) / sgn.length).toFixed(3)}`,
    )
  }
  console.log('HORIZON_STATS\n' + rows.join('\n'))
})
