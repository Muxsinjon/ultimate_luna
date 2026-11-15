import type { Site } from './data'
import type { TerrainReq, TerrainScreen } from './finder'
import { loadSiteLayers } from './terrainCache'
import { footprintDetail, NO_TERRAIN, terrainScreenFrom } from './terrainCompare'
import { loadTerrainIndex, sampleGrid, terrainSiteFor } from './terrainMesh'
/** Screen each site's 5 m terrain footprint (Milestones 2–3 estimators); sites without processed terrain are unknown. */
export async function terrainScreens(list: Site[], req: TerrainReq): Promise<Record<string, TerrainScreen>> {
  const index = await loadTerrainIndex()
  const out: Record<string, TerrainScreen> = {}
  for (const x of list) {
    const info = terrainSiteFor(index.sites, x.id, x.lat, x.lon)
    if (!info) {
      out[x.id] = NO_TERRAIN(x.name)
      continue
    }
    const { asset, hazards } = await loadSiteLayers(info.id)
    const h = sampleGrid(asset, x.lat, x.lon)
    if (h === null) {
      out[x.id] = NO_TERRAIN(x.name)
      continue
    }
    const d = footprintDetail(hazards, asset, { lat: x.lat, lon: x.lon }, h, req.radiusM, {
      slope: req.maxSlopeDeg,
      roughness: req.maxRoughM,
    })
    out[x.id] = terrainScreenFrom(d, info.product, x.name)
  }
  return out
}
