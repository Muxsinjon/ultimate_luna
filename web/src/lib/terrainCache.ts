import { loadIllumination, type IlluminationAsset } from './terrainShadow'
import { loadHazards, type HazardData } from './hazardAnalysis'
import { loadTerrainAsset, type TerrainAsset } from './terrainMesh'

/**
 * Session cache of verified terrain + hazard layers for the comparison views. Each site is fetched and
 * checksum-verified once; remounting a pane or returning to the workspace reuses it instead of cancelling and
 * re-downloading ~12 MB. A failed load is evicted so "Retry" fetches again.
 */
const hazardCache = new Map<string, Promise<HazardData>>()
/**
 * Session cache of a site's verified 5 m hazard layers (~10 MB), shared by the single-site panel and the comparison
 * panes. Never aborted: a remount or mode switch reuses the download instead of cancelling and repeating it.
 */
export function loadSiteHazards(siteId: string) {
  let p = hazardCache.get(siteId)
  if (!p) {
    p = loadHazards(new AbortController().signal, siteId)
    p.catch(() => hazardCache.delete(siteId))
    hazardCache.set(siteId, p)
  }
  return p
}

const cache = new Map<string, Promise<{ asset: TerrainAsset; hazards: HazardData }>>()
export function loadSiteLayers(siteId: string) {
  let p = cache.get(siteId)
  if (!p) {
    const abort = new AbortController() // never aborted: callers ignore results they no longer need
    p = Promise.all([loadTerrainAsset(abort.signal, siteId), loadSiteHazards(siteId)]).then(([asset, hazards]) => ({
      asset,
      hazards,
    }))
    p.catch(() => cache.delete(siteId))
    cache.set(siteId, p)
  }
  return p
}

const illum = new Map<string, Promise<IlluminationAsset>>()
/** Session cache of a site's verified illumination inputs (far-field horizon grid and PSR sample). */
export function loadSiteIllumination(siteId: string) {
  let p = illum.get(siteId)
  if (!p) {
    p = loadIllumination(undefined, siteId)
    p.catch(() => illum.delete(siteId))
    illum.set(siteId, p)
  }
  return p
}
