// Redesign story: scroll progress (0..1) -> displayed mission time. Pure, unit-tested.
export const T0 = Date.parse('2026-11-22T01:00:00Z')
export const H = 3_600_000
/** Before the sunlight section the time holds at T0; the sunlight section sweeps 48 h; the Earth section sweeps 27 days. */
export const storyTime = (p: number) =>
  p < 0.5 ? T0 : p < 0.7 ? T0 + ((p - 0.5) / 0.2) * 48 * H : T0 + 48 * H + Math.min(1, (p - 0.7) / 0.2) * 27 * 24 * H
