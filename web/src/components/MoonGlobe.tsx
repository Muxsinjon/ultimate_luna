import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { globeCoordinates, globePoint, moonToGlobe } from '../lib/globe'
import { loadGlobalDem } from '../lib/data'
import { globalElevation, lunarDisplayRadius } from '../lib/globalTerrain'
import { vectorsAt } from '../lib/analysis'
import { loadTerrainIndex, terrainSiteFor, type TerrainIndex } from '../lib/terrainMesh'
import { useStore } from '../lib/store'
import { fmtLat, fmtLon } from '../lib/format'
import { cssVar } from '../lib/theme'

type Point = { lat: number; lon: number; name?: string; id?: string }

/** Whole-Moon context and location selection. Local science always uses the existing LOLA pipeline. */
export default function MoonGlobe() {
  const { s, set, site, data, addCustom, customBusy, theme } = useStore()
  const [point, setPoint] = useState<Point | null>(null)
  const [error, setError] = useState('')
  const [index, setIndex] = useState<TerrainIndex | null>(null)
  const [lighting, setLighting] = useState(false)
  const [terrainStatus, setTerrainStatus] = useState('Loading verified global LOLA elevation…')
  const host = useRef<HTMLDivElement>(null)
  const savedCamera = useRef<[number, number, number] | null>(null)
  const api = useRef<{ focus: (p: Point) => void; zoom: (factor: number) => void; update: () => void } | null>(null)
  const A = site(s.siteA),
    B = site(s.siteB)
  const selected = point ?? { lat: A.lat, lon: A.lon, id: A.id, name: A.name }
  const sun = useMemo(() => moonToGlobe(vectorsAt(data.eph, s.selectedTime).sun), [data.eph, s.selectedTime])
  const current = useRef({ selected, A, B, sun, lighting })
  useEffect(() => {
    current.current = { selected, A, B, sun, lighting }
    api.current?.update()
  })
  useEffect(() => {
    let live = true
    loadTerrainIndex().then(
      (i) => {
        if (live) setIndex(i)
      },
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [])
  const coverage = index && terrainSiteFor(index.sites, selected.id ?? '', selected.lat, selected.lon)

  useEffect(() => {
    const el = host.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- graphics capability fallback
      setError('The interactive globe needs WebGL. You can still choose a listed site or enter coordinates in Landing sites.')
      return
    }
    let disposed = false
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    const canvas = renderer.domElement
    canvas.tabIndex = 0
    canvas.setAttribute(
      'aria-label',
      'Interactive Moon. Drag to rotate, scroll or pinch to zoom. Click to select a location. Arrow keys rotate; Enter selects the centre.',
    )
    el.appendChild(canvas)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100)
    camera.position.set(3, 1, 0)
    const controls = new OrbitControls(camera, canvas)
    controls.enablePan = false
    controls.minDistance = 1.3
    controls.maxDistance = 5
    controls.enableDamping = false
    controls.rotateSpeed = 0.65
    const geometry = new THREE.SphereGeometry(1, 720, 360)
    const material = new THREE.MeshLambertMaterial({ color: cssVar('--c-moon') })
    const moon = new THREE.Mesh(geometry, material)
    scene.add(moon)
    const ambient = new THREE.AmbientLight(cssVar('--c-moon'), 2.1)
    const sunlight = new THREE.DirectionalLight(cssVar('--c-moon'), 2.5)
    scene.add(ambient, sunlight)
    const loader = new THREE.TextureLoader()
    const texture = loader.load(
      import.meta.env.BASE_URL + 'textures/moon_color.jpg',
      (t) => {
        if (disposed) {
          t.dispose()
          return
        }
        t.colorSpace = THREE.SRGBColorSpace
        material.map = t
        material.needsUpdate = true
        render()
      },
      undefined,
      () => {
        if (!disposed) setError('The lunar image could not load. Coordinates remain available; reload to retry the image.')
      },
    )
    const markerGeometry = new THREE.SphereGeometry(0.012, 12, 8)
    const markers = ['--c-site-a', '--c-site-b', '--c-sun'].map((token) => {
      const marker = new THREE.Mesh(markerGeometry, new THREE.MeshBasicMaterial({ color: cssVar(token), depthTest: true }))
      scene.add(marker)
      return marker
    })
    const render = () => {
      if (!disposed) renderer.render(scene, camera)
    }
    const update = () => {
      const c = current.current
      markers[0].position.set(...globePoint(c.A.lat, c.A.lon, 1.015))
      markers[1].position.set(...globePoint(c.B.lat, c.B.lon, 1.015))
      markers[2].position.set(...globePoint(c.selected.lat, c.selected.lon, 1.02))
      sunlight.position.set(...c.sun)
      sunlight.intensity = c.lighting ? 2.5 : 0
      ambient.intensity = c.lighting ? 0.22 : 2.1
      canvas.dataset.selected = JSON.stringify([c.selected.lat, c.selected.lon])
      render()
    }
    const focus = (p: Point) => {
      camera.position.set(...globePoint(Math.max(-89.9, Math.min(89.9, p.lat)), p.lon, 3.2))
      camera.up.set(0, 1, 0)
      controls.update()
      render()
    }
    api.current = {
      focus,
      zoom: (factor) => {
        camera.position.multiplyScalar(factor)
        controls.update()
        render()
      },
      update,
    }
    void loadGlobalDem().then(
      (dem) => {
        if (disposed) return
        const positions = geometry.getAttribute('position')
        let min = Infinity,
          max = -Infinity
        for (let i = 0; i < positions.count; i++) {
          const p = globeCoordinates([positions.getX(i), positions.getY(i), positions.getZ(i)])
          const h = globalElevation(dem, p.lat, p.lon)
          const radius = lunarDisplayRadius(h)
          positions.setXYZ(i, ...globePoint(p.lat, p.lon, radius))
          min = Math.min(min, h)
          max = Math.max(max, h)
        }
        positions.needsUpdate = true
        geometry.computeVertexNormals()
        geometry.computeBoundingSphere()
        canvas.dataset.terrain = 'LOLA LDEM_16'
        canvas.dataset.elevationRange = JSON.stringify([min, max])
        setTerrainStatus('Real LOLA elevation · true vertical scale · 0.5° display mesh (about 15 km at the equator)')
        render()
      },
      () => {
        if (!disposed)
          setTerrainStatus(
            'Elevation unavailable: showing a spherical imagery globe only. Retry by reloading; location tools remain available.',
          )
      },
    )
    const ray = new THREE.Raycaster()
    const pick = (x: number, y: number) => {
      ray.setFromCamera(new THREE.Vector2(x, y), camera)
      const hit = ray.intersectObject(moon)[0]
      if (hit) setPoint(globeCoordinates(hit.point.toArray()))
    }
    let down: { x: number; y: number; id: number } | null = null
    const pointerdown = (e: PointerEvent) => {
      down = e.isPrimary && e.button === 0 ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null
    }
    const pointerup = (e: PointerEvent) => {
      const start = down
      down = null
      if (!start || e.pointerId !== start.id || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return
      const r = canvas.getBoundingClientRect()
      pick((2 * (e.clientX - r.left)) / r.width - 1, 1 - (2 * (e.clientY - r.top)) / r.height)
      down = null
    }
    const cancel = () => {
      down = null
    }
    const key = (e: KeyboardEvent) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Enter') {
        pick(0, 0)
        return
      }
      const p = globeCoordinates(camera.position.toArray())
      focus({
        lat: Math.max(-89.9, Math.min(89.9, p.lat + (e.key === 'ArrowUp' ? 10 : e.key === 'ArrowDown' ? -10 : 0))),
        lon: p.lon + (e.key === 'ArrowLeft' ? -15 : e.key === 'ArrowRight' ? 15 : 0),
      })
    }
    const lost = (e: Event) => {
      e.preventDefault()
      setError('Graphics context lost. Reload the globe, or choose a location from Landing sites.')
    }
    canvas.addEventListener('pointerdown', pointerdown)
    canvas.addEventListener('pointerup', pointerup)
    canvas.addEventListener('pointercancel', cancel)
    canvas.addEventListener('keydown', key)
    canvas.addEventListener('webglcontextlost', lost)
    controls.addEventListener('change', render)
    const resize = new ResizeObserver(() => {
      const w = Math.max(1, el.clientWidth),
        h = Math.max(1, el.clientHeight)
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
    })
    resize.observe(el)
    update()
    if (savedCamera.current) {
      camera.position.set(...savedCamera.current)
      controls.update()
      render()
    } else focus({ lat: 0, lon: 0 })
    return () => {
      savedCamera.current = camera.position.toArray()
      disposed = true
      api.current = null
      resize.disconnect()
      controls.dispose()
      canvas.removeEventListener('pointerdown', pointerdown)
      canvas.removeEventListener('pointerup', pointerup)
      canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('keydown', key)
      canvas.removeEventListener('webglcontextlost', lost)
      geometry.dispose()
      material.dispose()
      texture.dispose()
      markerGeometry.dispose()
      markers.forEach((m) => m.material.dispose())
      renderer.dispose()
      canvas.remove()
    }
  }, [theme])

  const choose = async (slot: 'A' | 'B', destination?: 'finder' | 'surface') => {
    setError('')
    try {
      if (selected.id) set(slot === 'A' ? { siteA: selected.id } : { siteB: selected.id })
      else await addCustom(selected.lat, selected.lon, slot)
      if (destination) set({ ws: destination, surfaceSite: slot, surface3d: destination === 'surface' })
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const focusSite = (id: string) => {
    const x = site(id)
    setPoint(x)
    api.current?.focus(x)
  }
  return (
    <section className="moon-picker panel" aria-labelledby="moon-title">
      <div className="panel-head">
        <div>
          <p className="eyebrow">01 / Choose your location</p>
          <h3 id="moon-title">The whole Moon. Your next landing site.</h3>
        </div>
        <a className="badge" href="https://svs.gsfc.nasa.gov/4720/" target="_blank" rel="noreferrer">
          NASA LRO imagery
        </a>
      </div>
      <div className="moon-picker-grid">
        <div className="moon-globe-shell">
          <div className="moon-globe" ref={host} data-testid="moon-globe" />
          <span className="globe-crosshair" aria-hidden>
            +
          </span>
          <div className="globe-controls" aria-label="Globe navigation">
            <button className="btn" onClick={() => api.current?.focus({ lat: 0, lon: 0 })}>
              Near side
            </button>
            <button className="btn" onClick={() => api.current?.focus({ lat: -89.9, lon: 0 })}>
              South pole
            </button>
            <button className="btn" onClick={() => api.current?.focus(selected)}>
              Selected point
            </button>
            <button className="btn" aria-label="Zoom in on Moon" onClick={() => api.current?.zoom(0.8)}>
              +
            </button>
            <button className="btn" aria-label="Zoom out on Moon" onClick={() => api.current?.zoom(1.25)}>
              −
            </button>
          </div>
        </div>
        <div className="globe-selection">
          <p className="eyebrow">Selected location</p>
          <h4>{selected.name ?? 'Your lunar location'}</h4>
          <p className="globe-coordinates num" data-testid="globe-coordinates">
            {fmtLat(selected.lat)} · {fmtLon(selected.lon)}
          </p>
          <p className="coverage-note">
            {coverage
              ? 'Detailed terrain available: real NASA 5 m data, displayed as a 20 m mesh.'
              : 'Regional terrain available. Sun/Earth timelines and the horizon panorama work here; detailed 3D ground is not available.'}
          </p>
          <div className="actions">
            <button className="btn primary" disabled={customBusy} onClick={() => void choose('A')}>
              Use as Site A
            </button>
            <button className="btn" disabled={customBusy} onClick={() => void choose('B')}>
              Use as Site B
            </button>
          </div>
          <div className="actions">
            <button className="btn" disabled={customBusy} onClick={() => void choose('A', 'finder')}>
              Plan a mission here
            </button>
            <button className="btn" disabled={customBusy} onClick={() => void choose('A', 'surface')}>
              View from the surface
            </button>
          </div>
          {customBusy && <p role="status">Computing this location’s terrain horizon…</p>}
          <label className="globe-light-toggle">
            <input type="checkbox" checked={lighting} onChange={(e) => setLighting(e.target.checked)} /> Show day and night
          </label>
          <p className="small muted">
            Globe lighting follows the time slider and shows solar direction, not local terrain shadows. Use Surface View for local
            visibility.
          </p>
          <p className="eyebrow">Try a detailed terrain site</p>
          <div className="globe-presets">
            {index?.sites.map((x) => (
              <button key={x.id} className="btn" onClick={() => focusSite(x.plannerId)}>
                {x.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="small muted" role="status" data-testid="global-terrain-source">
        {terrainStatus}. Source:{' '}
        <a href="https://pds-geosciences.wustl.edu/missions/lro/lola.htm" target="_blank" rel="noreferrer">
          NASA PDS / LRO LOLA
        </a>
        ; LDEM_16 reduced to a 4-pixel/degree elevation grid. Detailed local meshes use separate 5 m source data. Global relief is subtle at
        true lunar scale.
      </p>
      <p className="small muted">
        Drag to rotate · scroll or pinch to zoom · click a point to select. Keyboard: arrows rotate, Enter selects the centre. Neutral
        marker = Site A, pink = Site B, gold = selection. Use the site lists or coordinate entry for precise selection.
      </p>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </section>
  )
}
