// Longitude conventions. Internal storage: east-positive 0..360. Display: −180..180 with E/W.

/** Normalize any longitude (deg) to [0, 360). */
export function normalizeLon360(lon: number): number {
  if (!Number.isFinite(lon)) throw new RangeError('longitude must be finite')
  const x = lon % 360
  const r = x < 0 ? x + 360 : x
  return r === 360 ? 0 : r + 0 // +0 turns -0 into 0
}

/** Convert to (−180, 180]. */
export function toLon180(lon: number): number {
  const x = normalizeLon360(lon)
  return x > 180 ? x - 360 : x
}

/** Parse user input such as "29.2", "-150", "209.9E", "150.1 W", "150.1°W" → east-positive 0..360. */
export function parseLon(input: string): number | null {
  const m = input.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*°?\s*([EeWw])?$/)
  if (!m) return null
  let v = Number(m[1])
  if (m[2] && m[2].toUpperCase() === 'W') v = -Math.abs(v)
  if (!Number.isFinite(v) || Math.abs(v) > 360) return null
  return normalizeLon360(v)
}

/** Parse latitude such as "-84.79", "84.79S", "84.79 °S" → −90..90. */
export function parseLat(input: string): number | null {
  const m = input.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*°?\s*([NnSs])?$/)
  if (!m) return null
  let v = Number(m[1])
  if (m[2] && m[2].toUpperCase() === 'S') v = -Math.abs(v)
  if (!Number.isFinite(v) || Math.abs(v) > 90) return null
  return v
}
