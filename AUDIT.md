# Audit: Lunar Landing Site Navigator (before the professional pass)

Date: 2026-11-14. Branch `pro-upgrade`, baseline commit `c23d8eb`.
Screenshots: `docs/screenshots/before/` (explorer, compare, slip, about × 1440 and 390 px wide). No console errors or warnings were seen on any screen.

## 1. What exists and works (MVP map)

| MVP item | Status | Where |
|---|---|---|
| Site picker: curated sites plus custom coordinates | ✅ 17 sites with sources; custom lat/lon; click on the polar map | `SitePicker.tsx`, `PolarMap.tsx` |
| Date/time picker plus scrubber | ✅ UTC datetime input, ±7 d and ±1 lunar day buttons, range scrubber, play | `App.tsx` |
| Horizon sky chart | ✅ terrain silhouette (LOLA), Sun and Earth tracks, current discs | `SkyChart.tsx` |
| Metrics card | ✅ Sun and Earth state, countdowns, power, window percentages | `Metrics.tsx` |
| Compare mode with swimlanes | ✅ multiple scenarios aligned by days since landing; best value per column | `Compare.tsx` |
| Extra: Slip analyzer (landing-date calendar) | ✅ constraints, next viable date, slip by a month | `SlipAnalyzer.tsx` |
| Extra: method and validation page | ✅ Horizons cross-check, PGDA comparison, Chandrayaan-3 | `About.tsx`, `pipeline/validate_*.py` |
| Data pipeline | ✅ Horizons → ephemeris; LOLA → horizon masks and browser DEMs; PGDA overlays | `pipeline/` |

## 2. Missing or broken

- **Physics convention:** sunrise and sunset use the Sun's *centre*, not the upper limb. Earth visibility also uses the centre, with no partial-disc percentage. The partial-Sun fraction is a linear approximation, not the true circular-segment area.
- Longitude is stored as −180..180 in `sites.json`. The data contract will be 0–360 east-positive.
- There is no local-time toggle; the app is UTC only.
- There are no unit tests, no lint or format setup and no CI.
- There is no Planner/Explore mode, no onboarding, no "Copy link" button, no keyboard shortcuts and no tooltips that explain metrics.
- The default view opens on a site in darkness, so the core insight (a ridge hides a Sun that is above the flat horizon) needs explaining before anyone sees it.
- Compare shows no deltas against a baseline.
- There is no error boundary, skeleton loader or retry. If data loading fails, the user gets a bare text line.
- No favicon, Open Graph tags or OG image.
- The URL hash is read only on first load, so the back button and edited links don't restore state.
- Not deployed. There is no GitHub Pages workflow and no repo remote.

## 3. Ranked issues

### P0: blocks the demo or makes the science wrong
1. **Science:** visibility uses the disc centre. It must use the upper limb (sunrise/sunset), report partial-disc percentages for both Sun and Earth, and use the exact segment-area formula.
2. **Science:** physics functions have no unit tests, so the Validity claims rest on scripts only.
3. **Demo:** the default scenario opens in darkness and doesn't show the "ridge hides the Sun" moment within the first 5 seconds.
4. **Robustness:** there is no error boundary. One chart exception blanks the whole app the night before judging.
5. **Deploy:** there is no public URL yet (needs a team decision: GitHub account or org). Workflow files are missing.

### P1: looks amateur or confuses users
6. **Visual:** the type and colour system is a generic dark template: all-caps tracked labels, "A · B · C" meta strings, monospace body text in cards, a near-black background. It looks like a default dashboard rather than an instrument. There is no light theme.
7. **Visual:** the sky chart is not the hero. It sits below the cards at about 45% of the viewport height, with no axis titles, legend or hover readout. The Sun label overlaps the terrain.
8. **UX:** the metric cards are dense, monospace and wrap badly at 1440. They have no status chips and no tooltips. "Ops time" is unexplained jargon.
9. **Phone (390 px):** the charts shrink to unreadable size (axis text about 4 px), the tabs wrap onto two lines and the scrubber is far from the chart.
10. **Colour/accessibility:** Sun amber versus Both green is weakly distinguishable for deuteranopes. Lanes use colour only, with no pattern or label.
11. **Accessibility:** the charts have no text summary, the map pins have only colour state and there are no keyboard shortcuts. The scrubber has no value text.
12. **Compare:** the compact lane ticks are about 7 px (illegible), there are no ▲/▼ deltas and the "first sunset" column mixes two meanings.
13. **Map:** the brown sunlight ramp looks muddy and has no legend or scale.
14. **Time:** UTC only, with no local-time toggle.
15. **URL:** the mode and theme aren't encoded, there's no Copy link button and there's no hashchange handling.

### P2: nice to have
16. 3D shadow time-lapse (Three.js). Not built.
17. Ground-station (DSN) visibility.
18. Higher-resolution near-field terrain (LOLA 20 m or 5 m site DEMs) for curated polar sites.
19. Ephemeris beyond 2031, or a SPICE fallback.
20. Exporting scenarios as CSV or PDF.
21. Translations (all UI text is English as required, so this is optional).

## 4. Performance and bundle (before)
- JS: 258.5 kB (81.9 kB gzip). CSS: 9.2 kB (2.6 kB gzip). It is one chunk with no code splitting.
- Data: 7.4 MB, all fetched up front: ephemeris 1.9 MB, polar DEM 1.8 MB, global DEM 2.1 MB, PGDA overlays 1.8 MB, sites 80 kB. The DEMs and overlays are only needed for the map and custom sites, so they should be lazy-loaded.
- No runtime calls to Horizons. Everything is precomputed. ✅
- A custom-site horizon takes about 0.4 s on the main thread. That's acceptable; a Web Worker would be a P2.

## 5. Code quality
- Physics is reasonably separated (`lib/geometry.ts`, `lib/analysis.ts`, `lib/terrain.ts`), but the panel-power and formatting helpers are mixed into `analysis.ts`.
- There is no `any` anywhere. Strict TypeScript is on.
- Some hard-coded colours remain inside SVG and canvas code (`#fff`, `#000a`, the map ramp), bypassing tokens.
- The `react-hooks/exhaustive-deps` comment in `SkyChart.tsx` references a lint rule that isn't installed.

## 6. Screenshot review notes (before)
- **explorer-1440:** the strongest screen, but generic. The caps labels and middle-dot strings read as template chrome. The Sun label is drawn over the ridge. The metric cards carry four lines of 13 px monospace each. There is a lot of empty space under the map in the left rail.
- **explorer-390:** the charts are unreadable. Time controls sit three blocks away from the chart they control.
- **compare-1440:** the table works, but the swimlane ticks are illegible. Two-line "dark · sunrise +17h 54m" cells. Half the page is empty.
- **slip-390:** the calendar is cropped at day 12 with only a hidden horizontal scroll. The month labels take a third of the width.
- **about:** readable but plain. The validation tables are good content with weak presentation.

## Status of fixes (after the professional pass, 2026-11-14)

| # | Issue | Status | Where |
|---|---|---|---|
| 1 | Upper-limb rule, partial disc %, exact segment area | ✅ Fixed | `src/lib/physics/disc.ts`, `analysis.ts`; pipeline re-run |
| 2 | Physics unit tests | ✅ 41 tests, including a JPL Horizons fixture (3 sites × 3 times) | `src/lib/**/*.test.ts` |
| 3 | Default scenario shows the insight | ✅ Opens on Nobile Rim 2, 3 h before the Sun sets 6.4° above a flat horizon | `App.tsx` `DEFAULT` |
| 4 | Error boundary | ✅ Around every view, plus a retryable load error | `components/ui.tsx` |
| 5 | Deploy | ⚠️ Workflows ready (`pages.yml`, `ci.yml`); **needs a public GitHub repo (team decision)** | `.github/workflows/` |
| 6 | Generic visual system, no light theme | ✅ "Terminator" tokens, Barlow with tabular numbers, sentence-case labels, light theme | `styles/tokens.css`, `docs/DESIGN_SYSTEM.md` |
| 7 | Sky chart not the hero | ✅ Large hero with axis titles, legend, hover readout, sky tint by Sun state, screen-reader summary | `SkyChart.tsx` |
| 8 | Dense metric cards | ✅ Status chips, big tabular numbers, an ⓘ on every metric | `Metrics.tsx`, `glossary.ts` |
| 9 | Phone layout | ✅ Charts drawn at true pixel width; stacked layout; calendar fits 390 px | `useWidth`, `base.css` |
| 10 | Colour-only lanes | ✅ Okabe-Ito-derived colours, plus patterns (striped Earth, hatched Both), icons and labels | `Timeline.tsx` |
| 11 | Chart accessibility and keyboard | ✅ Text summaries, ←/→, Shift, Space; Lighthouse accessibility 100 | |
| 12 | Compare legibility and deltas | ✅ ▲/▼ vs baseline, best value outlined, readable ticks | `Compare.tsx` |
| 13 | Map ramp and legend | ✅ Theme-aware ramp with a 0–100 % scale | `PolarMap.tsx` |
| 14 | Local time | ✅ UTC / Local toggle (in the URL) | `format.ts` |
| 15 | URL state | ✅ Site, start, cursor, window, tab, mode and time zone; back/forward; Copy link | `url.ts` (tested) |
| 16–21 | P2 items | Open (see below) | |

**Bundle after:**
- Main JS is 42 kB (16 kB gzip), down from 254 kB (81 kB gzip). Compare, Calendar, Data and Map are separate chunks of 2–5 kB each. CSS is 22 kB.
- First-screen data is 0.8 MB, down from 7.4 MB: ephemeris 0.32 MB, sites 80 kB, validation 2 kB. The 5.7 MB of terrain and overlays load only when the map scrolls into view.
- **Lighthouse** (production build, gzip; reports in `docs/lighthouse/`):
  - Mobile: Performance 91 / 92 / 92, Accessibility 100, Best Practices 100.
  - Desktop: Performance 77 / 97 / 98 (the first cold run hit a 5.1 s simulated LCP while the observed render took 0.35 s), Accessibility 100, Best Practices 100.

**Still open (P2), with estimates:**
- Tidy the touching day ticks at the right edge of compact lanes on phones: 15 min.
- 3D shadow time-lapse (Three.js, lazy-loaded): 4–6 h.
- DSN ground-station visibility: 2–3 h.
- LOLA 20 m or 5 m near-field terrain for curated polar sites: 2–3 h of pipeline work plus a 0.5 MB data increase.
- Ephemeris beyond 2031 (re-run `fetch_ephemeris.py` with a later end year): 15 min.
- CSV or PDF export of scenarios: 1–2 h.
- Move the custom-site horizon into a Web Worker (it takes about 0.4 s on the main thread today): 1 h.
- Primary-source check for 3 flagged coordinates (SLIM, Chang'e 4, Shackleton floor) in LROC QuickMap: 30 min (team).
