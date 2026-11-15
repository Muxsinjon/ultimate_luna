import { loadTerrain, type Site } from './data'
import { fmtLat, fmtLon } from './format'
import { normalizeLon360 } from './physics/lon'
import type { customHorizon } from './terrain'

type Horizon = ReturnType<typeof customHorizon>

export function customCoordinates(lat: number, lon: number) {
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon)) throw new RangeError('Invalid lunar coordinates')
  // Keep picked footprints to six decimal degrees (~3 cm in latitude); this is storage precision, not terrain accuracy.
  // Match shared-link precision, including longitude wrap after rounding.
  const la = Number(lat.toFixed(6)),
    lo = normalizeLon360(Number(normalizeLon360(lon).toFixed(6)))
  return { lat: la, lon: lo, id: `custom:${la.toFixed(6)},${lo.toFixed(6)}` }
}

export function parseCustomId(id: string) {
  if (!/^custom:-?\d+(?:\.\d+)?,[+-]?\d+(?:\.\d+)?$/.test(id)) return null
  const [lat, lon] = id.slice(7).split(',').map(Number)
  try {
    return customCoordinates(lat, lon)
  } catch {
    return null
  }
}

export async function makeCustomSite(lat: number, lon: number): Promise<Site> {
  const p = customCoordinates(lat, lon)
  const terrain = await loadTerrain()
  const h = await new Promise<Horizon>((resolve, reject) => {
    const worker = new Worker(new URL('./customSite.worker.ts', import.meta.url), { type: 'module' })
    const timeout = window.setTimeout(() => {
      worker.terminate()
      reject(new Error('Terrain calculation timed out. Please try again.'))
    }, 30000)
    const finish = () => {
      window.clearTimeout(timeout)
      worker.terminate()
    }
    worker.onmessage = (e: MessageEvent<{ result?: Horizon; error?: string }>) => {
      finish()
      if (e.data.result) resolve(e.data.result)
      else reject(new Error(e.data.error ?? 'Terrain calculation failed'))
    }
    worker.onerror = () => {
      finish()
      reject(new Error('Terrain calculation could not start. Please reload and try again.'))
    }
    worker.postMessage({ terrain, lat: p.lat, lon: p.lon })
  })
  return {
    ...p,
    name: `Custom spot ${fmtLat(p.lat)}, ${fmtLon(p.lon)}`,
    group: 'Custom',
    source: 'user input',
    verify: false,
    custom: true,
    elevationM: h.elevationM,
    horizon: h.mask,
    horizonDistKm: h.distKm,
    terrainNote: `Horizon computed in your browser from LOLA terrain at ${h.resolution} resolution (coarser than the listed sites).`,
  }
}
