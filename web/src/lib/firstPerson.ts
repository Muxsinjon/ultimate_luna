// Milestone 7: first-person geometry on the processed 5 m terrain meshes. Pure functions, no DOM.
// Mesh frame (from terrainMesh.ts): X east, Y up, Z south at the crop origin, metres, curved lunar surface.
// Near the pole local east/north rotate across an 8 km crop, so the camera uses the ENU basis at its own position.
import { enuBasis, unitVec, type Vec3 } from './geometry'
import { localToSurface, sampleGrid, surfaceToLocal, bodyDirectionToLocal, type SurfacePoint, type TerrainAsset } from './terrainMesh'
import { farHorizon, localHorizon, type FarField } from './terrainShadow'
import { polarXY } from './terrain'

const D2R = Math.PI / 180

/** Default eye height above the local terrain surface (m): a standing astronaut's eye level, labelled in the UI. */
export const DEFAULT_EYE_M = 1.7

export interface CameraFrame {
  /** camera position in the mesh frame (m) */
  pos: Vec3
  /** local east / north / up at the camera, in the mesh frame (unit vectors) */
  east: Vec3
  north: Vec3
  up: Vec3
  /** terrain height under the camera (m, relative to the 1737.4 km sphere) */
  groundM: number
  point: SurfacePoint
}

/** Camera frame `eyeM` above the 20 m mesh surface at (lat, lon); null outside valid terrain (never extrapolated). */
export function cameraFrame(asset: TerrainAsset, lat: number, lon: number, eyeM = DEFAULT_EYE_M): CameraFrame | null {
  const g = sampleGrid(asset, lat, lon)
  if (g === null || !(eyeM >= 0)) return null
  const origin = { ...asset.meta.origin, elevationM: sampleGrid(asset, asset.meta.origin.lat, asset.meta.origin.lon) ?? 0 }
  const b = enuBasis(lon, lat)
  return {
    pos: surfaceToLocal({ lat, lon, elevationM: g + eyeM }, origin),
    east: bodyDirectionToLocal(b.e, asset.meta.origin),
    north: bodyDirectionToLocal(b.n, asset.meta.origin),
    up: bodyDirectionToLocal(unitVec(lon, lat), asset.meta.origin),
    groundM: g,
    point: { lat, lon, elevationM: g },
  }
}

/** Unit vector (mesh frame) for azimuth clockwise from local north and elevation above the local horizontal plane. */
export function lookVector(f: CameraFrame, azDeg: number, elDeg: number): Vec3 {
  const ce = Math.cos(elDeg * D2R),
    se = Math.sin(elDeg * D2R),
    sa = Math.sin(azDeg * D2R),
    ca = Math.cos(azDeg * D2R)
  return [0, 1, 2].map((i) => ce * (sa * f.east[i] + ca * f.north[i]) + se * f.up[i]) as Vec3
}

/** Inverse of lookVector: azimuth (0–360) and elevation (deg) of a mesh-frame direction seen from the camera. */
export function azElFromLocal(f: CameraFrame, v: Vec3): { az: number; el: number } {
  const d = (a: Vec3) => v[0] * a[0] + v[1] * a[1] + v[2] * a[2]
  const e = d(f.east),
    n = d(f.north),
    u = d(f.up)
  return { az: (((Math.atan2(e, n) / D2R) % 360) + 360) % 360, el: Math.atan2(u, Math.hypot(e, n)) / D2R }
}

/** Walk `distM` along the ground toward azimuth `azDeg`; stays `marginM` inside the crop (null if it would leave). */
export function walk(asset: TerrainAsset, f: CameraFrame, azDeg: number, distM: number, marginM = 200): SurfacePoint | null {
  const dir = lookVector(f, azDeg, 0)
  const origin = { ...asset.meta.origin, elevationM: sampleGrid(asset, asset.meta.origin.lat, asset.meta.origin.lon) ?? 0 }
  const p = localToSurface([f.pos[0] + dir[0] * distM, f.pos[1] + dir[1] * distM, f.pos[2] + dir[2] * distM], origin)
  const m = asset.meta
  const xy = polarXY(p.lat, p.lon)
  const c = (xy.x - m.x0) / m.dx,
    r = (xy.y - m.y0) / m.dy
  const marginPx = marginM / m.dx
  if (c < marginPx || r < marginPx || c > m.width - 1 - marginPx || r > m.height - 1 - marginPx) return null
  const h = sampleGrid(asset, p.lat, p.lon)
  return h === null ? null : { lat: p.lat, lon: p.lon, elevationM: h }
}

/** Nearest mesh vertex (row, col) to a surface point, or null outside the crop. */
export function nearestVertex(asset: TerrainAsset, lat: number, lon: number): { r: number; c: number } | null {
  const m = asset.meta,
    p = polarXY(lat, lon)
  const c = Math.round((p.x - m.x0) / m.dx),
    r = Math.round((p.y - m.y0) / m.dy)
  return r >= 0 && c >= 0 && r < m.height && c < m.width ? { r, c } : null
}

/**
 * 360° horizon at the camera's nearest vertex: the 20 m mesh inside the crop, the LOLA 240 m far field outside, and
 * their maximum (what the first-person view shows). Degrees, `step` apart from azimuth 0.
 */
export function horizonProfile(asset: TerrainAsset, far: FarField, r: number, c: number, step = 2) {
  const az: number[] = [],
    local: number[] = [],
    farEl: number[] = [],
    combined: number[] = []
  for (let a = 0; a < 360; a += step) {
    const l = localHorizon(asset, r, c, a, far.observerHeightM),
      f = farHorizon(asset, far, r, c, a)
    az.push(a)
    local.push(l)
    farEl.push(f)
    combined.push(Math.max(l, f))
  }
  return { az, local, far: farEl, combined }
}
