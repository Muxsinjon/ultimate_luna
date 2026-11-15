import { expect, it } from 'vitest'
import { H, storyTime, T0 } from './story'

it('maps scroll progress to time monotonically and stays inside the ephemeris coverage', () => {
  expect(storyTime(0)).toBe(T0)
  expect(storyTime(0.5)).toBe(T0)
  expect(storyTime(0.7)).toBe(T0 + 48 * H)
  expect(storyTime(1)).toBe(T0 + 48 * H + 27 * 24 * H)
  let prev = -Infinity
  for (let p = 0; p <= 1; p += 0.01) {
    expect(storyTime(p)).toBeGreaterThanOrEqual(prev)
    prev = storyTime(p)
  }
  expect(storyTime(1)).toBeLessThan(Date.parse('2031-12-31T18:00:00Z'))
})
