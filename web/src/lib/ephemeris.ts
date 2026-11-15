// Rebuild the hourly ephemeris from the shipped coarse file (every `factor`-th hour).
// Milestone 4: centripetal-free uniform Catmull-Rom cubic through the shipped samples (it passes through every
// shipped row exactly); the Sun direction is re-normalized afterwards. Measured against the full hourly Horizons
// series over 2023-2031 (pipeline/validate_astronomy.py): Earth direction max 0.0014°, p95 0.00003°;
// Sun max 0.0003°. Linear interpolation (used before Milestone 4) gave Earth max 0.0048°, p95 0.0036°.
// At the two file ends the missing neighbour is a linear extension, so the first/last interval is linear.

/** rows: Float32Array of n×6 [ex, ey, ez, sx, sy, sz]. Returns ((n−1)·factor + 1)×6. */
export function upsampleEphemeris(rows: Float32Array, factor: number): Float32Array {
  if (!Number.isInteger(factor) || factor < 1) throw new RangeError('factor must be a positive integer')
  const n = rows.length / 6
  if (!Number.isInteger(n) || n < 1) throw new RangeError('rows must be a multiple of 6')
  if (factor === 1) return rows
  const m = (n - 1) * factor + 1
  const out = new Float32Array(m * 6)
  const at = (i: number, c: number) => {
    if (i < 0) return 2 * rows[c] - rows[6 + c]
    if (i > n - 1) return 2 * rows[(n - 1) * 6 + c] - rows[(n - 2) * 6 + c]
    return rows[i * 6 + c]
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < factor; k++) {
      const t = k / factor,
        t2 = t * t,
        t3 = t2 * t
      const o = (i * factor + k) * 6
      for (let c = 0; c < 6; c++) {
        const p0 = at(i - 1, c),
          p1 = at(i, c),
          p2 = at(i + 1, c),
          p3 = at(i + 2, c)
        out[o + c] = 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3)
      }
      const s = Math.hypot(out[o + 3], out[o + 4], out[o + 5])
      out[o + 3] /= s
      out[o + 4] /= s
      out[o + 5] /= s
    }
  }
  out.set(rows.subarray((n - 1) * 6, n * 6), (m - 1) * 6)
  return out
}
