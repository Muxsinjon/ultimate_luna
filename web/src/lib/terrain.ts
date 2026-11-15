// In-browser terrain horizon for custom coordinates (coarser DEMs than the
// precomputed curated sites). Same algorithm as pipeline/horizon_mask.py.
import type { Terrain } from './data'
import { D2R, R_MOON_KM, destination, enuBasis, unitVec } from './geometry'

const R_M = R_MOON_KM * 1000

function bilinear(h: Int16Array, w: number, rows: number, row: number, col: number, wrap: boolean) {
  let r0 = Math.floor(row)
  r0 = Math.max(0, Math.min(rows - 2, r0))
  const fr = Math.max(0, Math.min(1, row - r0))
  let c0: number, c1: number, fc: number
  if (wrap) {
    const fl = Math.floor(col)
    c0 = ((fl % w) + w) % w
    c1 = (c0 + 1) % w
    fc = col - fl
  } else {
    c0 = Math.max(0, Math.min(w - 2, Math.floor(col)))
    c1 = c0 + 1
    fc = Math.max(0, Math.min(1, col - c0))
  }
  const a = h[r0 * w + c0] * (1 - fc) + h[r0 * w + c1] * fc
  const b = h[(r0 + 1) * w + c0] * (1 - fc) + h[(r0 + 1) * w + c1] * fc
  return a * (1 - fr) + b * fr
}

export function polarXY(lat: number, lon: number) {
  const rho = 2 * R_M * Math.tan(Math.PI / 4 + (lat * D2R) / 2)
  return { x: rho * Math.sin(lon * D2R), y: rho * Math.cos(lon * D2R) }
}

export function polarLatLon(x: number, y: number) {
  const rho = Math.hypot(x, y)
  const lat = (2 * Math.atan(rho / (2 * R_M)) - Math.PI / 2) / D2R
  const lon = Math.atan2(x, y) / D2R
  return { lat, lon }
}

export function makeHeight(d: Terrain) {
  const { polar, global } = d
  const pm = polar.meta
  const gm = global.meta
  return (lat: number, lon: number): number => {
    if (lat <= pm.minLat + 0.3) {
      const { x, y } = polarXY(lat, lon)
      const col = pm.offsetPx + x / pm.scaleM - 0.5
      const row = pm.offsetPx - y / pm.scaleM - 0.5
      return bilinear(polar.h, pm.n, pm.n, row, col, false)
    }
    const row = (90 - lat) * gm.ppd - 0.5
    const col = (((lon % 360) + 360) % 360) * gm.ppd - 0.5
    return bilinear(global.h, gm.cols, gm.rows, row, col, true)
  }
}

export function customHorizon(d: Terrain, lat: number, lon: number, azStep = 0.5, maxKm = 250, obsM = 2) {
  const height = makeHeight(d)
  const polar = lat <= d.polar.meta.minLat + 0.3
  const step = polar ? d.polar.meta.scaleM / 1000 : 2.0
  const siteH = height(lat, lon)
  const s = unitVec(lon, lat).map((c) => c * (R_M + siteH + obsM))
  const { u } = enuBasis(lon, lat)
  const n = Math.round(360 / azStep)
  const mask = new Array<number>(n)
  const distKm = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const az = i * azStep
    let best = -90,
      bestDist = 0
    for (let dist = step; dist <= maxKm; dist += step) {
      const [plat, plon] = destination(lat, lon, az, dist)
      const r = R_M + height(plat, plon)
      const p = unitVec(plon, plat)
      const vx = p[0] * r - s[0]
      const vy = p[1] * r - s[1]
      const vz = p[2] * r - s[2]
      const el = Math.asin((vx * u[0] + vy * u[1] + vz * u[2]) / Math.hypot(vx, vy, vz)) / D2R
      if (el > best) {
        best = el
        bestDist = dist
      }
    }
    mask[i] = Math.round(best * 1000) / 1000
    distKm[i] = Math.round(bestDist * 100) / 100
  }
  return { mask, distKm, elevationM: Math.round(siteH), resolution: polar ? `${d.polar.meta.scaleM} m` : '~7.6 km' }
}
