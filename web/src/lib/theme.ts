// Read design tokens for canvas / computed colours. Components otherwise use CSS variables directly.
export function cssVar(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim()
}

/** Parse "#rrggbb" into [r, g, b]. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export type Theme = 'dark' | 'light'

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
}
