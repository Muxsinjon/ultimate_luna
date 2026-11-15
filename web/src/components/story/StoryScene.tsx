// Redesign: scroll-driven 3D story scene. Real NASA textures (LRO Moon, Blue Marble Earth, SDO Sun, Hipparcos/Tycho
// stars) placed with the app's JPL Horizons ephemeris. Moon frame = MOON_ME (texture longitude 0 at centre).
// Distances are compressed so Earth and Moon fit on screen; directions, lighting and phases are real.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { vectorsAt } from '../../lib/analysis'
import type { Ephemeris } from '../../lib/data'
import { unitVec, type Vec3 } from '../../lib/geometry'
import { cssVar } from '../../lib/theme'
import { makeEarth, makeSun, makeStarPoints } from './bodies'
import { starsMoonME } from '../../lib/stars'

const BASE = import.meta.env.BASE_URL + 'textures/'
/** MOON_ME (x lon 0, y lon 90° E, z north) -> three.js sphere frame (Y up, lon 0 at +X, lon 90° E at −Z) */
export const toThree = (v: Vec3) => new THREE.Vector3(v[0], v[2], -v[1])
const EARTH_DIST = 28 // Moon radii (true: 221) - compressed for the story
const EARTH_R = 3.67 // Earth radius in Moon radii (true ratio)

export interface StoryFrame {
  /** 0..1 progress through the story */
  p: number
  /** mission time shown (ms UTC) */
  t: number
}
export interface StoryPin {
  lat: number
  lon: number
}

// camera keyframes [progress, position, target], re-evaluated every frame from the real Sun/Earth directions
type V = THREE.Vector3
const near = (lat: number, lon: number, r: number) => toThree(unitVec(lon, lat)).multiplyScalar(r)
/** low over the south pole, looking horizontally toward a body (its horizontal direction at the pole) */
function poleView(dir: V): [V, V] {
  const h = new THREE.Vector3(dir.x, 0, dir.z).normalize()
  const pos = new THREE.Vector3(0, -1.012, 0).add(h.clone().multiplyScalar(-0.16))
  return [
    pos,
    pos
      .clone()
      .add(h.multiplyScalar(10))
      .add(new THREE.Vector3(0, 1.4, 0)),
  ]
}
function keyframes(earthDir: V, sunDir: V): [number, V, V][] {
  const e = earthDir.clone().multiplyScalar(EARTH_DIST)
  const side = new THREE.Vector3().crossVectors(earthDir, new THREE.Vector3(0, 1, 0)).normalize()
  const [sp, st] = poleView(sunDir)
  const [ep, et] = poleView(earthDir)
  const hero = e
    .clone()
    .add(earthDir.clone().multiplyScalar(17))
    .add(side.clone().multiplyScalar(9.5))
    .add(new THREE.Vector3(0, 1.2, 0))
  return [
    [0.0, hero, side.clone().multiplyScalar(4)],
    [
      0.2,
      earthDir
        .clone()
        .multiplyScalar(4.2)
        .add(new THREE.Vector3(0, -0.6, 0)),
      new THREE.Vector3(0, -0.15, 0),
    ],
    [0.4, near(-58, 20, 2.7), new THREE.Vector3(0, -0.85, 0)],
    [0.6, sp, st],
    [0.8, ep, et],
    [1.0, near(-30, 60, 4.6), new THREE.Vector3(0.6, -0.2, 0)],
  ]
}

const smooth = (x: number) => x * x * (3 - 2 * x)

export default function StoryScene({
  eph,
  frame,
  pins,
  reduced,
}: {
  eph: Ephemeris
  frame: React.RefObject<StoryFrame>
  pins: StoryPin[]
  reduced: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    } catch {
      el.classList.add('story-fallback') // CSS shows a static gradient; the story text still works
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 4000)
    const tex = new THREE.TextureLoader()
    const load = (f: string, srgb = true) => {
      const t = tex.load(BASE + f)
      if (srgb) t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      return t
    }
    // stars: ecliptic north roughly along the Moon's spin axis (within 1.5°); longitude aligned with the Sun each frame
    const stars = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 48, 24),
      new THREE.MeshBasicMaterial({ map: load('stars.jpg'), side: THREE.BackSide, color: 0x262626 }),
    )
    stars.rotation.x = (-23.44 * Math.PI) / 180
    const starRig = new THREE.Group()
    starRig.add(stars)
    scene.add(starRig)
    // crisp catalogue stars (the photo above is kept only as a faint Milky Way glow)
    const starPts = makeStarPoints(1400)
    scene.add(starPts.points)
    let starHour = -1
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(1, 192, 96),
      new THREE.MeshStandardMaterial({
        map: load('moon_color.jpg'),
        bumpMap: load('moon_height.jpg', false),
        bumpScale: 2.2,
        roughness: 1,
        metalness: 0,
      }),
    )
    scene.add(moon)
    const earthBody = makeEarth(EARTH_R)
    const earth = earthBody.group
    scene.add(earth)
    const sunBody = makeSun()
    const sun = sunBody.group
    scene.add(sun)
    const light = new THREE.DirectionalLight(0xffffff, 3.2)
    scene.add(light)
    scene.add(new THREE.AmbientLight(0xffffff, 0.035))
    const pinMat = new THREE.MeshBasicMaterial({ color: cssVar('--c-accent') })
    const pinMeshes: THREE.Mesh[] = []
    for (const p of pins) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 12, 8), pinMat)
      pinMeshes.push(m)
      m.position.copy(toThree(unitVec(p.lon, p.lat)).multiplyScalar(1.004))
      moon.add(m)
    }
    const v0 = vectorsAt(eph, frame.current.t)
    const k0 = keyframes(toThree(v0.earth).normalize(), toThree(v0.sun).normalize())
    const camPos = k0[0][1].clone(),
      camTgt = k0[0][2].clone()
    let raf = 0,
      visible = true
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    window.addEventListener('resize', resize)
    const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting))
    io.observe(el)
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (!visible) return
      const { p, t } = frame.current
      const { earth: ev, sun: sv } = vectorsAt(eph, t)
      const sd = toThree(sv).normalize()
      const ed = toThree(ev).normalize()
      light.position.copy(sd).multiplyScalar(100)
      sun.position.copy(sd).multiplyScalar(900)
      sun.scale.setScalar(900 * Math.tan((0.2666 * 4 * Math.PI) / 180)) // disc drawn 4× true size for visibility
      sun.lookAt(0, 0, 0)
      earthBody.setSun(sd)
      earth.position.copy(ed).multiplyScalar(EARTH_DIST)
      earth.rotation.y = (t / 86_164_100) * 2 * Math.PI // sidereal spin (illustrative)
      starRig.rotation.y = Math.atan2(-sd.z, sd.x) // keeps the faint Milky Way glow roughly consistent with the Sun
      const hourNow = Math.floor(t / 3_600_000)
      if (hourNow !== starHour && starPts.catalogue().length) {
        starHour = hourNow
        const m = starsMoonME(starPts.catalogue(), sv, t)
        const d = new Float32Array(m.length)
        for (let i = 0; i < m.length; i += 3) d.set([m[i], m[i + 2], -m[i + 1]], i) // MOON_ME -> three
        starPts.place(d)
      }
      // camera along the keyframes, eased and damped for smoothness
      const keys = keyframes(ed, sd)
      let i = 0
      while (i < keys.length - 2 && p > keys[i + 1][0]) i++
      const [p0, a0, b0] = keys[i],
        [p1, a1, b1] = keys[i + 1]
      const f = smooth(Math.min(1, Math.max(0, (p - p0) / (p1 - p0))))
      const wantPos = a0.clone().lerp(a1, f),
        wantTgt = b0.clone().lerp(b1, f)
      const k = reduced ? 1 : 0.08
      camPos.lerp(wantPos, k)
      camTgt.lerp(wantTgt, k)
      camera.position.copy(camPos)
      // near the surface, 'up' is the local vertical (at the south pole that is -Y)
      const alt = camPos.length()
      const w = Math.min(1, Math.max(0, (2.2 - alt) / 1.0))
      camera.up.set(0, 1, 0).lerp(camPos.clone().normalize(), w).normalize()
      camera.lookAt(camTgt)
      const ps = Math.min(1, Math.max(0.06, (alt - 1) / 1.6))
      for (const m of pinMeshes) m.scale.setScalar(ps)
      renderer.render(scene, camera)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', resize)
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.MeshStandardMaterial | undefined
        mat?.map?.dispose()
        mat?.bumpMap?.dispose()
        mat?.dispose?.()
      })
      earthBody.dispose()
      starPts.dispose()
      sunBody.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [eph, frame, pins, reduced])
  return <div ref={host} className="story-canvas" aria-hidden />
}
