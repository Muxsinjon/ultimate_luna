import type { Terrain } from './data'
import { customHorizon } from './terrain'

// Each request owns its worker. Large terrain arrays are cloned, never detached from the shared cache.
self.onmessage = (event: MessageEvent<{ terrain: Terrain; lat: number; lon: number }>) => {
  try {
    const { terrain, lat, lon } = event.data
    self.postMessage({ result: customHorizon(terrain, lat, lon) })
  } catch (e) {
    self.postMessage({ error: (e as Error).message })
  }
}
