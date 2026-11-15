// Milestone 5: time-dependent terrain shadow and Earth line of sight on the processed 5 m sites. Pure functions.
//
// Horizon toward azimuth `az` at a mesh vertex = max(local, far):
//  - local: march over the 20 m display mesh inside the 8 × 8 km crop (straight line in the polar stereographic
//    plane along the vertex's initial bearing; ground distance = map distance / scale factor), exact spherical
//    elevation angles (terrainElevationDeg), observer 2 m above the vertex;
//  - far: terrain outside the crop from the planner's LOLA 240 m DEM, precomputed on a 21 × 21 grid (400 m) × 720
//    azimuths by pipeline/illumination_sites.py, interpolated bilinearly with a first-order correction for the
//    vertex's height difference to each grid point.
// A body is visible where its upper limb clears that horizon (the project's terrain rule); the visible disc fraction
// uses the circular-segment formula. Accuracy against a native 5 m reference is measured in the tests and docs.
import { azEl, enuBasis, unitVec, type Vec3 } from './geometry'
import { SUN_RADIUS_DEG, R_EARTH_KM, R_MOON_KM, angularRadiusDeg, discFractionAbove, terrainElevationDeg } from './physics/disc'
import { polarLatLon } from './terrain'
import { checkedFile, terrainBase, type TerrainAsset } from './terrainMesh'

const R_M = R_MOON_KM * 1000
const D2R = Math.PI / 180

export interface FarField {
  grid: number
  gridStepVertices: number
  azCount: number
  azStepDeg: number
  observerHeightM: number
  /** grid × grid × azCount, degrees */
  el: Float32Array
  /** grid × grid × azCount, km to the limiting terrain */
  distKm: Float32Array
}

export interface IlluminationMeta {
  version: number
  siteId: string
  grid: number
  gridStepVertices: number
  azStepDeg: number
  azCount: number
  observerHeightM: number
  farElQuantumDeg: number
  farDistQuantumKm: number
  maxDistanceKm: number
  farTerrain: string
  assets: {
    farEl: { file: string; sha256: string }
    farDist: { file: string; sha256: string }
    psr: { file: string; sha256: string; width: number; height: number; note: string; source: { url: string; resolutionM: number[] } }
  }
  psrFraction: number
}

export interface IlluminationAsset {
  meta: IlluminationMeta
  far: FarField
  /** 401 × 401 at mesh vertices: 1 PSR, 0 not, 255 no data */
  psr: Uint8Array
}

/** Build the far field from the raw little-endian buffers (int16 0.01°, uint16 0.1 km). */
export function decodeFarField(meta: IlluminationMeta, elBytes: ArrayBuffer, distBytes: ArrayBuffer): FarField {
  const n = meta.grid * meta.grid * meta.azCount
  if (elBytes.byteLength !== n * 2 || distBytes.byteLength !== n * 2) throw new Error('Far-field horizon file has the wrong size')
  const ev = new DataView(elBytes),
    dv = new DataView(distBytes)
  const el = new Float32Array(n),
    distKm = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    el[i] = ev.getInt16(i * 2, true) * meta.farElQuantumDeg
    distKm[i] = dv.getUint16(i * 2, true) * meta.farDistQuantumKm
  }
  return {
    grid: meta.grid,
    gridStepVertices: meta.gridStepVertices,
    azCount: meta.azCount,
    azStepDeg: meta.azStepDeg,
    observerHeightM: meta.observerHeightM,
    el,
    distKm,
  }
}

/** Far-field horizon (deg) at mesh vertex (r, c) toward az, height-corrected to the vertex's own height. */
export function farHorizon(asset: TerrainAsset, far: FarField, r: number, c: number, azDeg: number): number {
  const w = asset.meta.width
  const hv = asset.heights[r * w + c]
  const gr = r / far.gridStepVertices,
    gc = c / far.gridStepVertices
  const r0 = Math.min(far.grid - 2, Math.floor(gr)),
    c0 = Math.min(far.grid - 2, Math.floor(gc))
  const fr = gr - r0,
    fc = gc - c0
  const a = ((((azDeg % 360) + 360) % 360) / far.azStepDeg) % far.azCount
  const a0 = Math.floor(a) % far.azCount,
    a1 = (a0 + 1) % far.azCount,
    fa = a - Math.floor(a)
  let out = 0
  for (const [dr, dc, wt] of [
    [0, 0, (1 - fr) * (1 - fc)],
    [0, 1, (1 - fr) * fc],
    [1, 0, fr * (1 - fc)],
    [1, 1, fr * fc],
  ] as const) {
    if (wt === 0) continue
    const gi = ((r0 + dr) * far.grid + (c0 + dc)) * far.azCount
    const el = far.el[gi + a0] * (1 - fa) + far.el[gi + a1] * fa
    const d = far.distKm[gi + a0] * (1 - fa) + far.distKm[gi + a1] * fa
    const hg = asset.heights[(r0 + dr) * far.gridStepVertices * w + (c0 + dc) * far.gridStepVertices]
    // a higher observer sees the same distant terrain lower by ≈ Δh / d (small-angle, first order)
    out += wt * (el - (hv - hg) / (Math.max(d, 0.1) * 1000) / D2R)
  }
  return out
}

/** Local horizon (deg) over the 20 m mesh toward az from vertex (r, c), observer `obsM` above the surface. */
export function localHorizon(asset: TerrainAsset, r: number, c: number, azDeg: number, obsM = 2): number {
  const m = asset.meta,
    h = asset.heights
  const x = m.x0 + c * m.dx,
    y = m.y0 + r * m.dy
  const rho = Math.hypot(x, y)
  const k = 1 + (rho * rho) / (4 * R_M * R_M) // stereographic scale factor (map / ground)
  // map-plane unit vectors of local north (away from the south pole) and east
  const nx = rho > 0 ? x / rho : 0,
    ny = rho > 0 ? y / rho : 1
  const ex = ny,
    ey = -nx
  const s = Math.sin(azDeg * D2R),
    co = Math.cos(azDeg * D2R)
  const ux = s * ex + co * nx,
    uy = s * ey + co * ny
  const h0 = (h[r * m.width + c] + obsM) / 1000
  let best = -90
  let dMap = 0
  for (;;) {
    dMap += dMap < 1000 ? 20 : dMap < 3000 ? 40 : 80
    const col = c + (ux * dMap) / m.dx,
      row = r + (uy * dMap) / m.dy
    if (col < 0 || row < 0 || col > m.width - 1 || row > m.height - 1) break
    const c0 = Math.min(m.width - 2, Math.floor(col)),
      r0 = Math.min(m.height - 2, Math.floor(row))
    const fc = col - c0,
      fr = row - r0
    const i = r0 * m.width + c0
    const z = (h[i] * (1 - fc) + h[i + 1] * fc) * (1 - fr) + (h[i + m.width] * (1 - fc) + h[i + m.width + 1] * fc) * fr
    const e = terrainElevationDeg(dMap / k / 1000, z / 1000, h0)
    if (e > best) best = e
  }
  return best
}

export interface IlluminationField {
  /** vertices sampled every `stride` mesh vertices */
  stride: number
  size: number
  /** visible fraction of the Sun's disc, 0..1 */
  sun: Float32Array
  /** visible fraction of Earth's disc, 0..1 (geometric line of sight only) */
  earth: Float32Array
  /** share of sampled vertices with any part of the disc visible / the full disc visible */
  sunAnyPct: number
  sunFullPct: number
  earthAnyPct: number
}

/** Shadow field at one instant. `sunDir` unit MOON_ME; `earthFromMoon` km MOON_ME. */
export function illuminationField(asset: TerrainAsset, far: FarField, sunDir: Vec3, earthFromMoon: Vec3, stride = 2): IlluminationField {
  const m = asset.meta
  const size = Math.floor((m.width - 1) / stride) + 1
  const sun = new Float32Array(size * size),
    earth = new Float32Array(size * size)
  let any = 0,
    full = 0,
    eAny = 0
  for (let i = 0; i < size; i++)
    for (let j = 0; j < size; j++) {
      const r = i * stride,
        c = j * stride
      const v = vertexVisibility(asset, far, r, c, sunDir, earthFromMoon)
      sun[i * size + j] = v.sunFrac
      earth[i * size + j] = v.earthFrac
      if (v.sunFrac > 0) any++
      if (v.sunFrac >= 1) full++
      if (v.earthFrac > 0) eAny++
    }
  const n = size * size
  return { stride, size, sun, earth, sunAnyPct: (100 * any) / n, sunFullPct: (100 * full) / n, earthAnyPct: (100 * eAny) / n }
}

export function vertexVisibility(asset: TerrainAsset, far: FarField, r: number, c: number, sunDir: Vec3, earthFromMoon: Vec3) {
  const m = asset.meta
  const { lat, lon } = polarLatLon(m.x0 + c * m.dx, m.y0 + r * m.dy)
  const b = enuBasis(lon, lat)
  const s = azEl(sunDir, b)
  const u = unitVec(lon, lat)
  const rr = R_MOON_KM + (asset.heights[r * m.width + c] + far.observerHeightM) / 1000
  const ev: Vec3 = [earthFromMoon[0] - u[0] * rr, earthFromMoon[1] - u[1] * rr, earthFromMoon[2] - u[2] * rr]
  const e = azEl(ev, b)
  const eR = angularRadiusDeg(R_EARTH_KM, Math.hypot(...ev))
  // skip the march when the body is far above any terrain (the crop's relief cannot exceed ~25°) or far below 0°
  const hor = (az: number, el: number, rad: number) =>
    el - rad > 30
      ? -90
      : el + rad < -15
        ? 90
        : Math.max(localHorizon(asset, r, c, az, far.observerHeightM), farHorizon(asset, far, r, c, az))
  const hs = hor(s.az, s.el, SUN_RADIUS_DEG),
    he = hor(e.az, e.el, eR)
  return {
    sunAz: s.az,
    sunEl: s.el,
    sunHorizon: hs,
    sunFrac: discFractionAbove(s.el - hs, SUN_RADIUS_DEG),
    earthAz: e.az,
    earthEl: e.el,
    earthHorizon: he,
    earthFrac: discFractionAbove(e.el - he, eR),
  }
}

/** Distance (m) from vertex (r, c) to the nearest crop edge. */
export const edgeDistanceM = (asset: TerrainAsset, r: number, c: number) =>
  Math.min(r, c, asset.meta.height - 1 - r, asset.meta.width - 1 - c) * asset.meta.dx

/** Load and checksum-verify a site's illumination inputs (far-field horizon grid and PGDA PSR sample). */
export async function loadIllumination(signal: AbortSignal | undefined, siteId: string): Promise<IlluminationAsset> {
  const base = terrainBase(siteId) + 'illumination/'
  const r = await fetch(base + 'illumination.json', { signal })
  if (!r.ok) throw new Error(`Could not load terrain illumination inputs (HTTP ${r.status})`)
  const meta = (await r.json()) as IlluminationMeta
  if (meta.version !== 1 || meta.siteId !== siteId) throw new Error('Illumination inputs belong to a different site')
  const [el, d, psr] = await Promise.all([
    checkedFile(base, meta.assets.farEl, signal),
    checkedFile(base, meta.assets.farDist, signal),
    checkedFile(base, meta.assets.psr, signal),
  ])
  const p = new Uint8Array(psr)
  if (p.length !== meta.assets.psr.width * meta.assets.psr.height) throw new Error('PSR layer has the wrong size')
  return { meta, far: decodeFarField(meta, el, d), psr: p }
}
