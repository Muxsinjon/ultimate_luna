// Milestone 7: first-person camera geometry vs the accepted Milestone 4 directions and the planner's 360° horizon.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bodyVectorsFromSite, makeCtx, sampleAt } from './analysis'
import { buildEphemeris, type EphemMeta, type Site } from './data'
import { azElFromLocal, cameraFrame, DEFAULT_EYE_M, horizonProfile, lookVector, nearestVertex, walk } from './firstPerson'
import { decodeFarField, type IlluminationMeta } from './terrainShadow'
import { bodyDirectionToLocal, sampleGrid, type TerrainAsset, type TerrainMeta } from './terrainMesh'

const root = resolve(__dirname, '../../public/data')
const buf = (p: string) => {
  const b = readFileSync(resolve(root, p))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
}
const load = (id: string) => {
  const meta = JSON.parse(readFileSync(resolve(root, `terrain/${id}/terrain.json`), 'utf8')) as TerrainMeta
  const asset = {
    meta,
    heights: new Float32Array(buf(`terrain/${id}/elevation.f32`)),
    errors: new Float32Array(buf(`terrain/${id}/uncertainty.f32`)),
    imageUrl: null,
  } as TerrainAsset
  const im = JSON.parse(readFileSync(resolve(root, `terrain/${id}/illumination/illumination.json`), 'utf8')) as IlluminationMeta
  return { asset, far: decodeFarField(im, buf(`terrain/${id}/illumination/far_el.i16`), buf(`terrain/${id}/illumination/far_d.u16`)) }
}
const eph = buildEphemeris(JSON.parse(readFileSync(resolve(root, 'ephem.json'), 'utf8')) as EphemMeta, new Float32Array(buf('ephem.bin')))
const planner = JSON.parse(readFileSync(resolve(root, 'sites.json'), 'utf8')) as { azStepDeg: number; sites: Site[] }
const flat = (lat: number, lon: number): Site => ({
  id: 'f',
  name: 'f',
  group: 't',
  lat,
  lon,
  source: 't',
  verify: false,
  elevationM: 0,
  horizon: new Array(720).fill(-90),
})

describe('first-person camera frame', () => {
  const { asset } = load('site01')
  it('stands the documented eye height above the source grid, never outside the crop', () => {
    const { lat, lon } = asset.meta.origin
    const f = cameraFrame(asset, lat, lon)!
    expect(f.groundM).toBeCloseTo(sampleGrid(asset, lat, lon)!, 9)
    expect(f.pos[1]).toBeCloseTo(DEFAULT_EYE_M, 3) // origin vertex: eye height straight up the local Y axis
    expect(cameraFrame(asset, 0, 0)).toBeNull()
    expect(cameraFrame(asset, lat, lon, -1)).toBeNull()
  })
  it('look vectors round-trip and form an orthonormal local basis', () => {
    const p = polarOffset(asset, 150, 330)
    const f = cameraFrame(asset, p.lat, p.lon)!
    for (const [az, el] of [
      [0, 0],
      [90, 10],
      [213.4, -3.2],
      [359.5, 45],
    ]) {
      const v = lookVector(f, az, el)
      const back = azElFromLocal(f, v)
      expect(back.el).toBeCloseTo(el, 9)
      expect(((back.az - az + 540) % 360) - 180).toBeCloseTo(0, 9)
    }
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    expect(dot(f.east, f.north)).toBeCloseTo(0, 12)
    expect(dot(f.east, f.up)).toBeCloseTo(0, 12)
  })
  it('Sun and Earth directions in the view equal the Milestone 4 az/el at the camera (incl. 4 km off-centre near the pole)', () => {
    const t = Date.parse('2027-02-03T07:00:00Z')
    for (const [r, c] of [
      [200, 200],
      [20, 380],
      [390, 15],
    ]) {
      const p = polarOffset(asset, r, c)
      const f = cameraFrame(asset, p.lat, p.lon, 0)!
      const v = bodyVectorsFromSite(eph, t, p.lat, p.lon, f.groundM)
      const ref = sampleAt(makeCtx({ ...flat(p.lat, p.lon), elevationM: f.groundM }, 0.5), eph, t)
      const s = azElFromLocal(f, bodyDirectionToLocal(v.sun, asset.meta.origin))
      const e = azElFromLocal(f, bodyDirectionToLocal(v.earth, asset.meta.origin))
      expect(s.el).toBeCloseTo(ref.sunEl, 6)
      expect(((s.az - ref.sunAz + 540) % 360) - 180).toBeCloseTo(0, 5)
      expect(e.el).toBeCloseTo(ref.earthEl, 6)
      expect(((e.az - ref.earthAz + 540) % 360) - 180).toBeCloseTo(0, 5)
    }
  })
  it('walking stays on the terrain surface and inside the crop', () => {
    const { lat, lon } = asset.meta.origin
    const f = cameraFrame(asset, lat, lon)!
    const p = walk(asset, f, 90, 100)!
    expect(p.elevationM).toBeCloseTo(sampleGrid(asset, p.lat, p.lon)!, 9)
    const moved = cameraFrame(asset, p.lat, p.lon)!
    expect(Math.hypot(moved.pos[0] - f.pos[0], moved.pos[2] - f.pos[2])).toBeGreaterThan(95)
    expect(walk(asset, f, 0, 5000)).toBeNull() // would leave the crop (200 m margin)
  })
})

describe('first-person horizon vs the accepted planner 360° mask', () => {
  for (const [id, plannerId] of [
    ['site01', 'connecting-ridge'],
    ['site04', 'shackleton-rim-site04'],
    ['site06', 'nobile-rim-1-site06'],
  ] as const) {
    it(`${id}: median difference small; larger differences come from near-field 5 m relief`, () => {
      const { asset, far } = load(id)
      const ps = planner.sites.find((s) => s.id === plannerId)!
      const v = nearestVertex(asset, ps.lat, ps.lon)!
      const prof = horizonProfile(asset, far, v.r, v.c, 0.5)
      const d = prof.combined.map((h, i) => h - ps.horizon[i])
      const abs = d.map(Math.abs).sort((a, b) => a - b)
      const med = abs[Math.floor(abs.length / 2)]
      // planner: 240 m terrain everywhere; first person: 20 m mesh nearby + the same 240 m DEM beyond the crop
      console.log(
        `HORIZON_VS_PLANNER ${id} median ${med.toFixed(3)} p95 ${abs[Math.floor(0.95 * abs.length)].toFixed(3)} max ${abs.at(-1)!.toFixed(3)} mean ${(d.reduce((a, b) => a + b, 0) / d.length).toFixed(3)}`,
      )
      expect(med).toBeLessThan(1.0)
    })
  }
})

function polarOffset(asset: TerrainAsset, r: number, c: number) {
  const m = asset.meta
  const x = m.x0 + c * m.dx,
    y = m.y0 + r * m.dy
  const rho = Math.hypot(x, y)
  return {
    lat: (2 * Math.atan(rho / (2 * 1737400)) - Math.PI / 2) * (180 / Math.PI),
    lon: ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360,
  }
}
