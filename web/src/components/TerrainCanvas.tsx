import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { bodyDirectionToLocal, localToSurface, surfaceToLocal, meshArrays, type SurfacePoint, type TerrainAsset } from '../lib/terrainMesh'
import type { Vec3 } from '../lib/geometry'
import type { HazardVisual } from './HazardPanel'
import { polarXY, polarLatLon } from '../lib/terrain'
import { sampleGrid } from '../lib/terrainMesh'
import { cssVar } from '../lib/theme'

type Action = 'reset' | 'in' | 'out' | 'rotate' | 'pan'
/**
 * Shared camera channel for side-by-side views. Members exchange the camera offset from its orbit target in
 * local metres (X east, Y up, Z south), so both views keep the same physical scale and orientation around
 * their own site. It never places the two terrains in one frame or implies they are adjacent.
 */
export interface CameraLink {
  members: Map<symbol, (offset: [number, number, number]) => void>
}
export default function TerrainCanvas({
  asset,
  site,
  selectedPoint,
  imagery,
  theme,
  onPick,
  visual,
  link,
  linked = false,
  label,
  bodies,
}: {
  asset: TerrainAsset
  site: SurfacePoint
  selectedPoint: SurfacePoint | null
  imagery: boolean
  theme: string
  visual: HazardVisual | null
  onPick: (p: SurfacePoint) => void
  link?: CameraLink
  /** whether this view currently follows and drives the shared camera */
  linked?: boolean
  /** prefixes control names when several canvases share a page */
  label?: string
  /** Sun and Earth directions (MOON_ME) at the selected time, drawn as rays from the site */
  bodies?: { sun: Vec3; earth: Vec3 } | null
}) {
  const host = useRef<HTMLDivElement>(null),
    action = useRef<(a: Action) => void>(() => {}),
    select = useRef<(p: SurfacePoint | null) => void>(() => {})
  const updateVisual = useRef<(v: HazardVisual | null) => void>(() => {})
  const updateBodies = useRef<(b: { sun: Vec3; earth: Vec3 } | null | undefined) => void>(() => {})
  const pick = useRef(onPick),
    [error, setError] = useState('')
  const following = useRef(linked)
  useEffect(() => {
    pick.current = onPick
    following.current = linked
  }, [onPick, linked])
  useEffect(() => {
    const container = host.current!,
      arrays = meshArrays(asset)
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      // Report external graphics initialization failure to the fallback UI.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(
        'WebGL 2 is unavailable. Enable hardware acceleration or try another browser. The planner and Surface View remain available.',
      )
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const canvas = renderer.domElement
    canvas.tabIndex = 0
    canvas.dataset.appearance = 'elevation'
    canvas.setAttribute(
      'aria-label',
      '3D lunar terrain. Drag to orbit, wheel to zoom, right drag or arrow keys to pan. Click to select terrain.',
    )
    container.appendChild(canvas)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(cssVar('--c-sky-night'))
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(arrays.positions, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(arrays.uv, 2))
    geometry.setIndex(new THREE.BufferAttribute(arrays.indices, 1))
    geometry.computeVertexNormals()
    const material = new THREE.MeshStandardMaterial({ color: cssVar('--c-terrain-edge'), roughness: 1, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(geometry, material)
    scene.add(mesh)
    scene.add(new THREE.AmbientLight(cssVar('--c-site-a'), 1))
    const light = new THREE.DirectionalLight(cssVar('--c-site-a'), 2)
    light.position.set(-1, 2, 1)
    scene.add(light)
    const span = Math.max(asset.meta.dx * (asset.meta.width - 1), -asset.meta.dy * (asset.meta.height - 1))
    const camera = new THREE.PerspectiveCamera(45, 1, 1, span * 30),
      controls = new OrbitControls(camera, canvas)
    controls.minDistance = 40
    controls.maxDistance = span * 5
    controls.maxPolarAngle = Math.PI * 0.49
    controls.listenToKeyEvents(canvas)
    const sitePos = new THREE.Vector3(...surfaceToLocal(site, arrays.origin))
    const dotGeometry = new THREE.SphereGeometry(span / 400, 16, 8),
      siteMaterial = new THREE.MeshBasicMaterial({ color: cssVar('--c-site-b') }),
      pointMaterial = new THREE.MeshBasicMaterial({ color: cssVar('--c-accent') })
    const marker = new THREE.Mesh(dotGeometry, siteMaterial)
    marker.position.copy(sitePos)
    scene.add(marker)
    const selected = new THREE.Mesh(dotGeometry, pointMaterial)
    selected.visible = false
    scene.add(selected)
    const overlayMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    const boundaryGeometry = new THREE.BufferGeometry()
    const boundaryMaterial = new THREE.LineBasicMaterial({ color: cssVar('--c-accent'), depthTest: false })
    const boundaryLine = new THREE.LineSegments(boundaryGeometry, boundaryMaterial)
    boundaryLine.renderOrder = 10
    scene.add(boundaryLine)
    const me = Symbol('terrain-view')
    let applying = false
    const render = () => {
      if (link && following.current && !applying) {
        const o = camera.position.clone().sub(controls.target).toArray() as [number, number, number]
        for (const [id, apply] of link.members) if (id !== me) apply(o)
      }
      canvas.dataset.camera = JSON.stringify([...camera.position.toArray(), ...controls.target.toArray()])
      renderer.render(scene, camera)
    }
    updateVisual.current = (v) => {
      if (v?.texture) {
        overlayMaterial.map = v.texture
        overlayMaterial.needsUpdate = true
        mesh.material = overlayMaterial
      } else mesh.material = material
      canvas.dataset.analysisLayer = v?.layer ?? 'elevation'
      const positions: number[] = []
      if (v?.footprint) {
        const { point, radius } = v.footprint,
          center = polarXY(point.lat, point.lon)
        const at = (i: number) => {
          const ll = polarLatLon(
            center.x + radius * Math.cos((i * 2 * Math.PI) / 128),
            center.y + radius * Math.sin((i * 2 * Math.PI) / 128),
          )
          const h = sampleGrid(asset, ll.lat, ll.lon)
          return h === null ? null : surfaceToLocal({ ...ll, elevationM: h + 3 }, arrays.origin)
        }
        for (let i = 0; i < 128; i++) {
          const a = at(i),
            b = at(i + 1)
          if (a && b) positions.push(...a, ...b)
        }
      }
      boundaryGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      boundaryGeometry.computeBoundingSphere()
      render()
    }
    const rayGeometry = { sun: new THREE.BufferGeometry(), earth: new THREE.BufferGeometry() }
    const rayMaterial = {
      sun: new THREE.LineBasicMaterial({ color: cssVar('--c-sun'), depthTest: false }),
      earth: new THREE.LineBasicMaterial({ color: cssVar('--c-earth'), depthTest: false }),
    }
    for (const k of ['sun', 'earth'] as const) {
      const line = new THREE.Line(rayGeometry[k], rayMaterial[k])
      line.renderOrder = 11
      scene.add(line)
    }
    updateBodies.current = (b) => {
      for (const k of ['sun', 'earth'] as const) {
        const pts: number[] = []
        if (b) {
          const d = bodyDirectionToLocal(b[k], arrays.origin)
          pts.push(
            ...sitePos.toArray(),
            ...sitePos
              .clone()
              .add(new THREE.Vector3(...d).multiplyScalar(span * 0.35))
              .toArray(),
          )
          canvas.dataset[k + 'Dir'] = JSON.stringify(d.map((x) => Number(x.toFixed(6))))
        } else delete canvas.dataset[k + 'Dir']
        rayGeometry[k].setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
        rayGeometry[k].computeBoundingSphere()
      }
      render()
    }
    select.current = (p) => {
      selected.visible = !!p
      if (p) selected.position.set(...surfaceToLocal(p, arrays.origin))
      render()
    }
    const reset = () => {
      controls.target.copy(sitePos)
      camera.position.copy(sitePos).add(new THREE.Vector3(span * 0.25, span * 0.55, span * 0.5))
      controls.update()
      render()
    }
    reset()
    controls.addEventListener('change', render)
    link?.members.set(me, (o) => {
      if (!following.current) return
      applying = true
      camera.position.copy(controls.target).add(new THREE.Vector3(...o))
      controls.update()
      render()
      applying = false
    })
    let disposed = false,
      texture: THREE.Texture | null = null
    if (imagery && asset.imageUrl)
      new THREE.TextureLoader().load(
        asset.imageUrl,
        (t) => {
          if (disposed) {
            t.dispose()
            return
          }
          texture = t
          t.colorSpace = THREE.SRGBColorSpace
          canvas.dataset.appearance = 'imagery'
          material.map = t
          material.color.set(cssVar('--c-site-a'))
          material.needsUpdate = true
          render()
        },
        undefined,
        () => setError('Verified LROC imagery could not be decoded. Switch to shaded elevation.'),
      )
    action.current = (a) => {
      if (a === 'reset') {
        reset()
        return
      }
      const v = camera.position.clone().sub(controls.target)
      if (a === 'in' || a === 'out')
        camera.position
          .copy(controls.target)
          .add(v.setLength(THREE.MathUtils.clamp(v.length() * (a === 'in' ? 0.8 : 1.25), controls.minDistance, controls.maxDistance)))
      else if (a === 'rotate') {
        v.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 12)
        camera.position.copy(controls.target).add(v)
      } else {
        const d = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(span * 0.05)
        camera.position.add(d)
        controls.target.add(d)
      }
      controls.update()
      render()
    }
    const observer = new ResizeObserver(() => {
      const w = Math.max(1, container.clientWidth),
        h = Math.max(1, container.clientHeight)
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
    })
    observer.observe(container)
    let down: { x: number; y: number } | null = null
    const start = (e: PointerEvent) => {
      down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null
    }
    const end = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) {
        down = null
        return
      }
      down = null
      const b = canvas.getBoundingClientRect(),
        ray = new THREE.Raycaster()
      ray.setFromCamera(new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, (-(e.clientY - b.top) / b.height) * 2 + 1), camera)
      const hit = ray.intersectObject(mesh)[0]
      if (hit) pick.current(localToSurface([hit.point.x, hit.point.y, hit.point.z], arrays.origin))
    }
    const lost = (e: Event) => {
      e.preventDefault()
      setError('Graphics context lost. Reload the terrain workspace.')
    }
    canvas.addEventListener('pointerdown', start)
    canvas.addEventListener('pointerup', end)
    canvas.addEventListener('webglcontextlost', lost)
    render()
    return () => {
      link?.members.delete(me)
      updateBodies.current = () => {}
      for (const k of ['sun', 'earth'] as const) {
        rayGeometry[k].dispose()
        rayMaterial[k].dispose()
      }
      updateVisual.current = () => {}
      overlayMaterial.dispose()
      boundaryGeometry.dispose()
      boundaryMaterial.dispose()
      disposed = true
      action.current = () => {}
      select.current = () => {}
      observer.disconnect()
      controls.dispose()
      canvas.removeEventListener('pointerdown', start)
      canvas.removeEventListener('pointerup', end)
      canvas.removeEventListener('webglcontextlost', lost)
      texture?.dispose()
      geometry.dispose()
      material.dispose()
      dotGeometry.dispose()
      siteMaterial.dispose()
      pointMaterial.dispose()
      renderer.dispose()
      canvas.remove()
    }
  }, [asset, site, theme, imagery, link])
  useEffect(() => {
    select.current(selectedPoint)
  }, [asset, site, theme, imagery, selectedPoint])
  useEffect(() => {
    updateVisual.current(visual)
  }, [visual, asset, site, theme, imagery])
  useEffect(() => {
    updateBodies.current(bodies)
  }, [bodies, asset, site, theme, imagery])
  return (
    <>
      <div className="terrain-toolbar">
        {(
          [
            ['reset', 'Reset camera'],
            ['in', 'Zoom in'],
            ['out', 'Zoom out'],
            ['rotate', 'Rotate right'],
            ['pan', 'Pan right'],
          ] as const
        ).map(([a, text]) => (
          <button
            type="button"
            className="btn"
            key={a}
            aria-label={label ? `${label}: ${text}` : undefined}
            onClick={() => action.current(a)}
          >
            {text}
          </button>
        ))}
      </div>
      <div className="terrain-canvas" ref={host} data-view={label} />
      {error && <p role="alert">{error}</p>}
    </>
  )
}
