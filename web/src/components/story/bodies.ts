// Realistic Earth and Sun for the story scene and the first-person Surface View.
// Earth: NASA Blue Marble (day) + Black Marble (night lights) blended by the real Sun direction, ocean glint, and an
// atmosphere rim. Sun: NASA SDO disc with layered glow (display aid). Colours of glows come from design tokens.
import * as THREE from 'three'
import { cssVar } from '../../lib/theme'

const BASE = import.meta.env.BASE_URL + 'textures/'
const loader = new THREE.TextureLoader()
export function texture(file: string, srgb = true) {
  const t = loader.load(BASE + file)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

export interface EarthBody {
  group: THREE.Group
  /** call each frame with the world-space unit vector toward the Sun */
  setSun: (dir: THREE.Vector3) => void
  dispose: () => void
}

export function makeEarth(radius: number): EarthBody {
  const sunDir = { value: new THREE.Vector3(1, 0, 0) }
  const day = texture('earth.jpg'),
    night = texture('earth_night.jpg')
  const surface = new THREE.ShaderMaterial({
    uniforms: { day: { value: day }, night: { value: night }, sunDir },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform sampler2D day; uniform sampler2D night; uniform vec3 sunDir;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vec3 n = normalize(vN);
        float l = dot(n, sunDir);
        vec3 d = texture2D(day, vUv).rgb;
        vec3 c = texture2D(night, vUv).rgb;
        float lit = smoothstep(-0.08, 0.22, l);
        float ocean = smoothstep(0.05, 0.25, d.b - max(d.r, d.g));
        float spec = pow(max(dot(reflect(-sunDir, n), normalize(vV)), 0.0), 48.0) * ocean * lit;
        vec3 col = d * (0.03 + 1.05 * lit) + vec3(1.0, 0.95, 0.85) * spec * 0.7;
        col += c * c * 1.6 * (1.0 - smoothstep(-0.2, 0.05, l));   // city lights only on the night side
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  })
  const globe = new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 64), surface)
  const atmoColor = new THREE.Color(cssVar('--c-earth'))
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.045, 96, 48),
    new THREE.ShaderMaterial({
      uniforms: { sunDir, color: { value: atmoColor } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
      vertexShader: `
        varying vec3 vN; varying vec3 vV;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 sunDir; uniform vec3 color;
        varying vec3 vN; varying vec3 vV;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
          float day = smoothstep(-0.35, 0.4, dot(normalize(vN), sunDir));
          gl_FragColor = vec4(color * 1.15, rim * day * 0.75);
        }`,
    }),
  )
  const group = new THREE.Group()
  group.add(globe, atmo)
  return {
    group,
    setSun: (dir) => sunDir.value.copy(dir).normalize(),
    dispose: () => {
      day.dispose()
      night.dispose()
    },
  }
}

function glowTexture(stops: [number, string][]) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  for (const [o, col] of stops) grad.addColorStop(o, col)
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

/** Sun: SDO disc of unit radius plus glow sprites; scale the returned group to the wanted disc radius. */
export function makeSun(style: 'sdo' | 'eye' = 'sdo'): { group: THREE.Group; dispose: () => void } {
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 96),
    // 'sdo': NASA SDO ultraviolet image (orange); 'eye': how the Sun looks to the eye from the Moon (blinding white)
    style === 'sdo'
      ? new THREE.MeshBasicMaterial({ map: texture('sun.jpg'), color: 0xfff1d6, transparent: true, toneMapped: false })
      : new THREE.MeshBasicMaterial({ color: 0xfffdf6, toneMapped: false }),
  )
  const sun = cssVar('--c-sun')
  const core = glowTexture([
    [0, 'rgba(255,250,235,1)'],
    [0.35, 'rgba(255,240,210,0.85)'],
    [1, 'rgba(255,220,170,0)'],
  ])
  const halo = glowTexture([
    [0, sun],
    [1, 'transparent'],
  ])
  const sprite = (map: THREE.Texture, size: number, opacity: number) => {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }),
    )
    s.scale.setScalar(size)
    return s
  }
  // glow sits behind the disc (rendered first, no depth write) so it only shows around the limb
  const h = style === 'sdo' ? sprite(halo, 10, 0.3) : sprite(halo, 22, 0.45),
    c = style === 'sdo' ? sprite(core, 1.9, 0.85) : sprite(core, 5, 1)
  h.renderOrder = 0
  c.renderOrder = 1
  disc.renderOrder = 2
  const group = new THREE.Group()
  group.add(h, c, disc)
  return {
    group,
    dispose: () => {
      core.dispose()
      halo.dispose()
    },
  }
}

/**
 * Real stars as crisp points (NASA HEASARC BSC5): size from magnitude, colour from B−V. Call `place(vectors)` with
 * unit direction vectors in the scene frame (one triple per catalogue star) whenever the date or frame changes.
 */
export function makeStarPoints(radius: number) {
  const geometry = new THREE.BufferGeometry()
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { scale: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: `
      attribute float size; attribute vec3 color; varying vec3 vColor; uniform float scale;
      void main() { vColor = color; gl_PointSize = size * scale; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vColor;
      void main() { float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(vColor, a); }`,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  let catalogue: number[][] = []
  const ready = fetch(BASE + 'stars_bsc5.json')
    .then((r) => r.json() as Promise<{ stars: number[][] }>)
    .then(({ stars }) => {
      catalogue = stars
      const size = new Float32Array(stars.length),
        color = new Float32Array(stars.length * 3)
      stars.forEach(([, , mag, bv], i) => {
        size[i] = Math.max(1.3, 5.4 - 0.7 * mag)
        const t = Math.max(0, Math.min(1, (bv + 0.3) / 1.9))
        const k = Math.max(0.35, Math.min(1, 1.15 - 0.13 * mag)) // fainter stars dimmer
        color.set([(0.78 + 0.22 * t) * k, (0.85 - 0.08 * Math.abs(t - 0.4)) * k, (1 - 0.42 * t) * k], i * 3)
      })
      geometry.setAttribute('size', new THREE.BufferAttribute(size, 1))
      geometry.setAttribute('color', new THREE.BufferAttribute(color, 3))
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(stars.length * 3), 3))
      return stars
    })
    .catch(() => [] as number[][])
  return {
    points,
    ready,
    catalogue: () => catalogue,
    /** directions: Float32Array of unit vectors in the scene frame (3 per star) */
    place: (dirs: Float32Array) => {
      const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
      if (!pos || pos.count * 3 !== dirs.length) return
      for (let i = 0; i < dirs.length; i++) (pos.array as Float32Array)[i] = dirs[i] * radius
      pos.needsUpdate = true
    },
    dispose: () => {
      geometry.dispose()
      material.dispose()
    },
  }
}
