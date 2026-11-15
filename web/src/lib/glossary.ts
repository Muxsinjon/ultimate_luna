// Tooltip text for every metric: what it means, how it's computed, where the data comes from.
import type { InfoText } from '../components/ui'

const EPH = 'JPL Horizons API (DE441), sub-solar and sub-Earth points, hourly 2023–2031, retrieved 2026-11-14'
const TERRAIN = 'horizon traced from LRO LOLA topography (240 m polar grid, 16 px/° global; 960 m for custom points)'

export const INFO: Record<string, InfoText> = {
  sun: {
    what: 'Whether any part of the Sun is above the real terrain horizon, and how much of its disc is visible.',
    how: 'Sun elevation minus the terrain horizon at the Sun’s azimuth. Sunset is when the upper limb meets the terrain. Visible % is the disc area above the horizon line.',
    source: `${EPH}; ${TERRAIN}.`,
  },
  earth: {
    what: 'Whether Earth is above the terrain horizon, so a direct radio link is geometrically possible.',
    how: 'Same as the Sun, using Earth’s 1.9° disc. Earth wobbles a few degrees in the lunar sky (libration), so it can sink behind nearby terrain.',
    source: `${EPH}; ${TERRAIN}. A ground station on Earth must also see the Moon.`,
  },
  power: {
    what: 'Solar power on 1 m² of vertical, sun-tracking panel with 30 % efficient cells.',
    how: '1361 W/m² × 0.30 × visible disc fraction × cos(Sun elevation). Vertical panels suit the low polar Sun.',
    source: 'Solar constant 1361 W/m²; Sun geometry from JPL Horizons. No thermal, dust or degradation losses.',
  },
  ops: {
    what: 'Share of the time window with both sunlight and a direct Earth link: the "operations window".',
    how: 'Overlap of the sunlit intervals and the Earth-in-view intervals, divided by the window length.',
    source: `${EPH}; ${TERRAIN}.`,
  },
  dark: {
    what: 'The longest continuous stretch without sunlight inside the window. Batteries and heaters must survive it.',
    how: 'Largest gap between sunlit intervals (upper-limb rule) within the window, including the edges.',
    source: `${EPH}; ${TERRAIN}.`,
  },
  noLink: {
    what: 'The longest continuous stretch without Earth above the terrain, when there is no direct-to-Earth link.',
    how: 'Largest gap between Earth-visible intervals inside the window.',
    source: `${EPH}; ${TERRAIN}.`,
  },
  sky: {
    what: 'A 360° view from the landing site: the grey silhouette is the real horizon, with the paths of the Sun and Earth over the window.',
    how: 'Rays cast every 0.5° of azimuth out to 250 km over LOLA terrain on a curved Moon, for an observer 2 m above the ground.',
    source: `${TERRAIN}; ${EPH}.`,
  },
  timeline: {
    what: 'How high the Sun and Earth stand above the terrain horizon, and the resulting windows.',
    how: 'Hourly ephemeris samples with interpolated rise and set times (to the minute).',
    source: `${EPH}; ${TERRAIN}.`,
  },
  slip: {
    what: 'Every day on which a lander could touch down with sunlight and an Earth link, under your constraints.',
    how: 'For each hour: touchdown needs Sun and Earth up. Then count uninterrupted sun hours and the Earth-visible share of the mission.',
    source: `${EPH}; ${TERRAIN}.`,
  },
  map: {
    what: 'Long-term share of time each spot sees the Sun (or Earth). Stronger colour means more, as shown in the scale under the map.',
    how: 'Average over an 18.6-year cycle by the LOLA team, resampled to 960 m.',
    source: 'Mazarico et al. 2011, Icarus 211; NASA GSFC PGDA "Lunar Polar Illumination" (AVGVISIB 75S 120 m).',
  },
}
