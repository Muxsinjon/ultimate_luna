# Design system: "Terminator"

The theme is named after the lunar *terminator*, the line between day and night, which is exactly what this tool measures. It should feel like a precise mission-control instrument: calm, legible and credible. It is not a sci-fi game.

**Single source of truth:** `web/src/styles/tokens.css`. Components use only these CSS variables. SVG and canvas code reads them through `cssVar('--token')` (`web/src/lib/theme.ts`).

## Principles
1. **The horizon is the protagonist.** The sky panorama is the largest element on the screen, and status chips sit on it. Everything else is supporting instrumentation.
2. **Instrument honesty.** Every number has a unit, a fixed precision and an ⓘ explaining its meaning, method and source.
3. **Colour means state.** Sun, Earth and both together are the only saturated colours. Chrome is neutral, and colour never carries meaning alone (each state also has an icon, pattern or label).
4. **Quiet chrome.** Use sentence-case labels, not tracked caps. Don't join metadata with "A · B · C". No decorative gradients; the only gradient is the sky in the panorama, and it encodes the Sun's state.

## Colour tokens

Semantic colours are derived from the Okabe-Ito colour-blind-safe palette and tuned for contrast on each theme.

| Token | Dark (default) | Light | Meaning, with its non-colour cue |
|---|---|---|---|
| `--c-bg` | `#1B1F25` | `#E8EBEE` | page (mare basalt / pale regolith) |
| `--c-surface` | `#232831` | `#F7F8F9` | panels |
| `--c-raised` | `#2D333D` | `#FFFFFF` | inputs, hover |
| `--c-line` | `#3A414D` | `#C9D0D8` | borders, grid |
| `--c-text` | `#ECE9E2` | `#1C2127` | primary text (anorthosite white) |
| `--c-text-muted` | `#A9A69E` | `#57606B` | secondary text (AA on surface) |
| `--c-sun` | `#F0A830` | `#9A5A00` | Sun, sunlight. Icon ☀; solid lane |
| `--c-earth` | `#5AB0F0` | `#0A65A8` | Earth, direct link. Icon ◐ (Earth glyph); lane with a top stripe |
| `--c-both` | `#3FC7A4` | `#08765F` | power and link together. Icon ✓; diagonal-hatched lane |
| `--c-none` | `#7A808B` | `#6B717B` | dark or no link. Icon ○; empty lane |
| `--c-warn` | `#F07F3C` | `#B0450D` | warning. Icon ⚠ |
| `--c-error` | `#EF5A5A` | `#BE2A2A` | error. Icon ✕ |
| `--c-terrain` | `#5E5A53` to `#2E2C29` | `#B9B3A8` to `#8D867A` | terrain fill (gradient) |
| `--c-sky-day` / `--c-sky-night` | `#2A3646` / `#12161C` | `#DCE6F0` / `#C6CFD9` | panorama sky; blends toward day as the Sun clears the terrain |

All text and token pairs meet WCAG AA (4.5:1 for body text, 3:1 for large text and UI glyphs) on `--c-surface`.

## Typography
- **Barlow** (Google Fonts, OFL) for all UI text. Its signage heritage suits an instrument. Weights used: 400, 500 and 600.
- **Barlow Semi Condensed** 600 for the product name, site titles and chart axis titles. The narrower width is the headline treatment.
- **Numbers** use `font-variant-numeric: tabular-nums` (`.num`), so digits don't jump while scrubbing. No monospace face is used.
- **Scale** (1.2 minor third): 12 / 14 / 16 (base) / 19 / 23 / 28 / 34 px, set as `--fs-0` … `--fs-6`.
- **Line height:** 1.45 for body text, 1.15 for headings. Measure: at most 72 characters per line in prose.

## Spacing, radius, elevation, motion
- **Spacing (8 px grid):** `--s-1` 4, `--s-2` 8, `--s-3` 12, `--s-4` 16, `--s-5` 24, `--s-6` 32, `--s-7` 48.
- **Radius**, tied to hierarchy:
  - `--r-sm` 6 for inputs and chips
  - `--r-md` 10 for tiles
  - `--r-lg` 16 for the hero chart frame
  - `--r-pill` 999 for segmented controls and status chips
- **Elevation:**
  - `--e-0` none (flat panels separated by lines)
  - `--e-1` popovers and tooltips: `0 6px 24px rgb(0 0 0 / .35)` (dark), `0 6px 24px rgb(20 30 40 / .14)` (light)
- **Motion:**
  - `--t-fast` 150 ms (hover, press), `--t-base` 220 ms (open/close, theme), easing `cubic-bezier(.2,.7,.2,1)`.
  - The only automatic motion is playback, which the user starts.
  - Under `prefers-reduced-motion: reduce` all transitions are 0 ms and playback steps in larger jumps.

## Number formatting (`web/src/lib/format.ts`)
| Quantity | Format | Example |
|---|---|---|
| Elevation, azimuth, margin | 0.1° (signed for margins) | `+1.8°`, `213.4°` |
| Latitude and longitude | 0.001° with hemisphere | `84.791° S, 29.196° E` |
| Duration ≥ 1 d | `D d H h` | `3 d 4 h` |
| Duration < 1 d | `H h M min` | `17 h 54 min` |
| Percentage | integer % | `53 %` |
| Distance | km, 0 decimals (1 decimal under 10 km) | `384 402 km` |
| Power | W/m², integer | `212 W/m²` |
| Time | `YYYY-MM-DD HH:MM UTC` (or local, with zone abbreviation) | `2026-11-15 05:54 UTC` |

## Components
- **Card / panel:** `--c-surface` with a 1 px `--c-line` border, `--r-md` radius and no shadow.
- **Metric tile:** a sentence-case label with ⓘ on the first line, a big number (`--fs-5`, tabular) with its unit, and one context line. Status uses a chip, not a coloured border.
- **Status chip:** pill shape, icon plus word ("☀ Sunlit", "◐ Earth link ✓", "○ Dark"), coloured tint background with full-colour text.
- **Chart frame:** `--r-lg`. Axis titles are in Barlow Semi Condensed. Every chart has a visible legend, a hover readout and a visually hidden text summary (`.sr-only`).
- **Tooltip / info popover:** `--c-raised`, `--e-1`, max 34 ch wide. It opens on hover or focus of the ⓘ button and closes on Escape. The text covers *meaning*, *how it's computed* and *source*.
- **Button:** primary (filled `--c-text` on `--c-bg`, used once per view), secondary (outline), quiet (text). Focus ring: 2 px `--c-earth`, offset 2 px.
- **Input / select:** `--c-raised`, 1 px line, `--r-sm`, at least 36 px tall (44 px on touch).
- **Tabs / segmented control:** pill group; the selected item is `--c-raised` plus 600 weight, with `aria-selected`.
- **Loading:** skeleton blocks that match the final layout (no spinners), using a shimmer that is disabled under reduced motion.
- **Empty state:** says what to do next ("Add a scenario to compare").
- **Error state:** says what failed and what to do, with a Retry button. A React error boundary wraps each view.
