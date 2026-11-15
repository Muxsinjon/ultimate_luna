// Milestone 7: immersive first-person view on the real 5 m terrain meshes (desktop first, optional WebXR).
// Geometry comes from the verified mesh (terrainMesh.meshArrays), Sun/Earth from the Milestone 4 ephemeris path,
// shading/shadow from the Milestone 5 horizon algorithm. Terrain beyond the crop is drawn as the LOLA 240 m
// far-field silhouette so the discs are hidden where the calculation hides them. Black sky: no atmosphere.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Vec3 } from '../lib/geometry'
import { lookVector, type CameraFrame } from '../lib/firstPerson'
import { bodyDirectionToLocal, meshArrays, type TerrainAsset } from '../lib/terrainMesh'
import type { FarField } from '../lib/terrainShadow'
import { cssVar } from '../lib/theme'
import { makeEarth, makeSun, makeStarPoints } from './story/bodies'
import { starsMoonME } from '../lib/stars'

export interface Bodies {
  /** mesh-frame unit directions from the camera */
  sun: Vec3
  earth: Vec3
  sunRadiusDeg: number
  earthRadiusDeg: number
}

interface XRSystemLike {
  isSessionSupported(mode: string): Promise<boolean>
  requestSession(mode: string, init?: unknown): Promise<XRSession>
}

const SKY_DIST = 100_000 // m: Sun/Earth discs drawn at 100 km with their true angular size
const RING_DIST = 40_000 // m: far-terrain silhouette ring

export default function FirstPersonView({
  asset,
  frame,
  far,
  farAt,
  bodies,
  shade,
  view,
  fov,
  theme,
  onView,
  onFov,
  onWalk,
  sunMoonME,
  timeMs,
}: {
  asset: TerrainAsset
  frame: CameraFrame
  far: FarField | null
  /** far-field horizon (deg) at the camera for an azimuth; null = not available */
  farAt: ((az: number) => number) | null
  bodies: Bodies
  /** optional per-vertex brightness texture (computed sunlit fraction); null = no computed shadow */
  shade: THREE.Texture | null
  view: { az: number; el: number }
  fov: number
  theme: string
  onView: (v: { az: number; el: number }) => void
  onFov: (f: number) => void
  onWalk: (azDeg: number, metres: number) => void
  /** MOON_ME unit vector to the Sun and the time, used to place the real star field */
  sunMoonME: Vec3
  timeMs: number
}) {
  const starInput = useRef({ sun: sunMoonME, t: timeMs })
  useEffect(() => {
    starInput.current = { sun: sunMoonME, t: timeMs }
  })
  const host = useRef<HTMLDivElement>(null)
  const api = useRef<{
    setCamera: (f: CameraFrame, v: { az: number; el: number }, fov: number) => void
    setBodies: (b: Bodies, f: CameraFrame) => void
    setShade: (t: THREE.Texture | null) => void
    setRing: (f: CameraFrame) => void
  } | null>(null)
  const [error, setError] = useState('')
  const [xr, setXr] = useState<'checking' | 'yes' | 'no'>('checking')
  const latest = useRef({ view, fov, onView, onFov, onWalk })
  useEffect(() => {
    latest.current = { view, fov, onView, onFov, onWalk }
  })
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const ringFar = useRef(farAt)

  useEffect(() => {
    const nav = navigator as Navigator & { xr?: XRSystemLike }
    if (!nav.xr) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- capability probe result
      setXr('no')
      return
    }
    nav.xr.isSessionSupported('immersive-vr').then(
      (ok) => setXr(ok ? 'yes' : 'no'),
      () => setXr('no'),
    )
  }, [])

  // scene: rebuilt only when the terrain asset or theme changes
  useEffect(() => {
    const container = host.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true })
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- report graphics failure to the fallback UI
      setError('WebGL is unavailable. The 360° horizon panorama remains available.')
      return
    }
    rendererRef.current = renderer
    renderer.xr.enabled = true
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const canvas = renderer.domElement
    canvas.tabIndex = 0
    canvas.setAttribute(
      'aria-label',
      'First-person view of the lunar surface. Drag to look around, wheel to zoom, W A S D to walk, arrow keys to look.',
    )
    container.appendChild(canvas)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(cssVar('--c-sky-night')) // no atmosphere: black sky, no haze
    const arrays = meshArrays(asset)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(arrays.positions, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(arrays.uv, 2))
    geometry.setIndex(new THREE.BufferAttribute(arrays.indices, 1))
    geometry.computeVertexNormals()
    const terrainMat = new THREE.MeshLambertMaterial({ color: cssVar('--c-terrain-edge') })
    const terrain = new THREE.Mesh(geometry, terrainMat)
    scene.add(terrain)
    // far terrain silhouette (LOLA 240 m beyond the crop): a ring from 6° below to the far-field horizon
    const ringGeom = new THREE.BufferGeometry()
    const ringMat = new THREE.MeshBasicMaterial({ color: cssVar('--c-terrain-bottom'), side: THREE.DoubleSide })
    const ring = new THREE.Mesh(ringGeom, ringMat)
    scene.add(ring)
    const sunLight = new THREE.DirectionalLight(0xffffff, 3)
    scene.add(sunLight, sunLight.target)
    // display aid only (not earthshine or scattering): keeps shadowed ground faintly visible
    scene.add(new THREE.AmbientLight(0xffffff, 0.05))
    // realistic bodies (NASA SDO Sun, Blue Marble / Black Marble Earth) and the real star map, faint
    const sunBody = makeSun('eye'),
      earthBody = makeEarth(1)
    const sun = sunBody.group,
      earth = earthBody.group
    scene.add(sun, earth)
    // real catalogue stars (NASA HEASARC BSC5) as crisp points, placed for the current date
    const starPts = makeStarPoints(200_000)
    const sky = starPts.points
    scene.add(sky)
    let starKey = ''
    const placeStars = () => {
      const { sun, t } = starInput.current
      const cat = starPts.catalogue()
      const key = `${Math.floor(t / 3_600_000)}`
      if (!cat.length || key === starKey) return
      starKey = key
      const m = starsMoonME(cat, sun, t)
      const out = new Float32Array(m.length)
      for (let i = 0; i < m.length; i += 3) out.set(bodyDirectionToLocal([m[i], m[i + 1], m[i + 2]], asset.meta.origin), i)
      starPts.place(out)
    }
    void starPts.ready.then(() => {
      placeStars()
      render()
    })
    const rig = new THREE.Group()
    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 300_000)
    rig.add(camera)
    scene.add(rig)
    let current: CameraFrame | null = null

    const render = () => {
      renderer.render(scene, camera)
      if (!current) return
      const project = (o: THREE.Object3D) => {
        const p = o.getWorldPosition(new THREE.Vector3()).project(camera)
        return p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1
          ? [Math.round(((p.x + 1) / 2) * canvas.width), Math.round(((1 - p.y) / 2) * canvas.height)]
          : null
      }
      canvas.dataset.sunPx = JSON.stringify(project(sun))
      canvas.dataset.earthPx = JSON.stringify(project(earth))
    }
    const setCamera = (f: CameraFrame, v: { az: number; el: number }, fovDeg: number) => {
      current = f
      rig.position.set(...f.pos)
      // rig axes: x = east, y = up, z = south (camera looks along -z = north before head/view rotation)
      const m = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...f.east),
        new THREE.Vector3(...f.up),
        new THREE.Vector3(...f.north).negate(),
      )
      rig.quaternion.setFromRotationMatrix(m)
      if (!renderer.xr.isPresenting) {
        camera.rotation.set(0, 0, 0)
        camera.rotateY((-v.az * Math.PI) / 180)
        camera.rotateX((v.el * Math.PI) / 180)
      }
      camera.fov = fovDeg
      camera.updateProjectionMatrix()
      canvas.dataset.view = JSON.stringify([Number(v.az.toFixed(3)), Number(v.el.toFixed(3)), fovDeg])
      render()
    }
    const setBodies = (b: Bodies, f: CameraFrame) => {
      const place = (o: THREE.Object3D, dir: Vec3, radiusDeg: number) => {
        o.position.set(f.pos[0] + dir[0] * SKY_DIST, f.pos[1] + dir[1] * SKY_DIST, f.pos[2] + dir[2] * SKY_DIST)
        o.scale.setScalar(SKY_DIST * Math.tan((radiusDeg * Math.PI) / 180))
        o.lookAt(...f.pos)
      }
      place(sun, b.sun, b.sunRadiusDeg)
      place(earth, b.earth, b.earthRadiusDeg)
      sunLight.position.set(f.pos[0] + b.sun[0] * 1000, f.pos[1] + b.sun[1] * 1000, f.pos[2] + b.sun[2] * 1000)
      earthBody.setSun(new THREE.Vector3(...b.sun))
      sky.position.set(...f.pos)
      placeStars()
      sunLight.target.position.set(...f.pos)
      render()
    }
    const setShade = (t: THREE.Texture | null) => {
      terrainMat.map = t
      terrainMat.color.set(t ? 0xffffff : cssVar('--c-terrain-edge'))
      terrainMat.needsUpdate = true
      canvas.dataset.shadow = t ? 'computed' : 'none'
      render()
    }
    const setRing = (f: CameraFrame) => {
      const pos: number[] = []
      const idx: number[] = []
      const fa = ringFar.current
      for (let i = 0; i <= 720; i++) {
        const az = i * 0.5
        const top = fa ? fa(az) : -90
        const lo = lookVector(f, az, -6),
          hi = lookVector(f, az, Math.max(-6, top))
        pos.push(...lo.map((x, k) => f.pos[k] + x * RING_DIST), ...hi.map((x, k) => f.pos[k] + x * RING_DIST))
        if (i < 720) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2)
      }
      ringGeom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      ringGeom.setIndex(idx)
      ringGeom.computeBoundingSphere()
      render()
    }
    api.current = { setCamera, setBodies, setShade, setRing }

    const resize = new ResizeObserver(() => {
      const w = Math.max(1, container.clientWidth),
        h = Math.max(1, container.clientHeight)
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
    })
    resize.observe(container)
    let drag: { x: number; y: number; az: number; el: number } | null = null
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId)
      drag = { x: e.clientX, y: e.clientY, ...latest.current.view }
    }
    const move = (e: PointerEvent) => {
      if (!drag) return
      const degPerPx = latest.current.fov / canvas.clientHeight
      latest.current.onView({
        az: (((drag.az - (e.clientX - drag.x) * degPerPx) % 360) + 360) % 360,
        el: Math.max(-80, Math.min(80, drag.el + (e.clientY - drag.y) * degPerPx)),
      })
    }
    const up = () => (drag = null)
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      latest.current.onFov(Math.max(10, Math.min(100, latest.current.fov * (e.deltaY > 0 ? 1.1 : 0.9))))
    }
    const key = (e: KeyboardEvent) => {
      const v = latest.current.view
      const look: Record<string, [number, number]> = { ArrowLeft: [-3, 0], ArrowRight: [3, 0], ArrowUp: [0, 2], ArrowDown: [0, -2] }
      const walkKeys: Record<string, number> = { w: 0, d: 90, s: 180, a: 270 }
      if (look[e.key]) {
        e.preventDefault()
        latest.current.onView({ az: (v.az + look[e.key][0] + 360) % 360, el: Math.max(-80, Math.min(80, v.el + look[e.key][1])) })
      } else if (e.key.toLowerCase() in walkKeys) {
        e.preventDefault()
        latest.current.onWalk(v.az + walkKeys[e.key.toLowerCase()], e.shiftKey ? 50 : 5)
      }
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('wheel', wheel, { passive: false })
    canvas.addEventListener('keydown', key)
    const lost = (e: Event) => {
      e.preventDefault()
      setError('Graphics context lost. Reload Surface View.')
    }
    canvas.addEventListener('webglcontextlost', lost)
    renderer.xr.addEventListener('sessionstart', () => renderer.setAnimationLoop(render))
    renderer.xr.addEventListener('sessionend', () => {
      renderer.setAnimationLoop(null)
      if (current) setCamera(current, latest.current.view, latest.current.fov)
    })
    return () => {
      api.current = null
      rendererRef.current = null
      renderer.setAnimationLoop(null)
      resize.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('keydown', key)
      canvas.removeEventListener('webglcontextlost', lost)
      geometry.dispose()
      terrainMat.dispose()
      ringGeom.dispose()
      ringMat.dispose()
      sunBody.dispose()
      earthBody.dispose()
      starPts.dispose()
      renderer.dispose()
      canvas.remove()
    }
  }, [asset, theme])

  useEffect(() => {
    ringFar.current = farAt
    api.current?.setRing(frame)
  }, [farAt, frame, far])
  useEffect(() => api.current?.setCamera(frame, view, fov), [frame, view, fov])
  useEffect(() => api.current?.setBodies(bodies, frame), [bodies, frame])
  useEffect(() => api.current?.setShade(shade), [shade])

  const enterVr = async () => {
    const nav = navigator as Navigator & { xr?: XRSystemLike }
    const r = rendererRef.current
    if (!nav.xr || !r) return
    try {
      const session = await nav.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] })
      await r.xr.setSession(session)
    } catch (e) {
      setError(`VR session could not start: ${(e as Error).message}`)
    }
  }

  return (
    <>
      <div className="fp-view" ref={host} data-testid="first-person" />
      {error && <p role="alert">{error}</p>}
      <p className="hint" data-testid="xr-status" data-xr={xr}>
        {xr === 'yes' ? (
          <>
            <button type="button" className="btn" onClick={() => void enterVr()}>
              Enter VR
            </button>{' '}
            Look-around only in VR (no artificial movement, to limit motion discomfort); time and position stay fixed during the session.
          </>
        ) : xr === 'no' ? (
          'VR is not available in this browser or device. The desktop view above is the complete experience; VR is optional.'
        ) : (
          'Checking for VR support…'
        )}
      </p>
    </>
  )
}
