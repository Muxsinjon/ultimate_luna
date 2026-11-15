# LunaWindow visual redesign: plan and checklist

Goal: anyone can **scroll and understand** lunar landing-site choice through real, animated NASA visuals. Short text, big visuals, smooth motion. The science tools stay intact; the story leads into them.

Inspiration (user's Pinterest board, reviewed 2026-11-15):
- **Moon:** a photographic grey full Moon on pure black.
- **Earth:** a Blue Marble globe.
- **Sun:** an orange ultraviolet limb with flares (SDO look).
- **Space:** deep black with fine stars.
- **Site:** a dark "space exploration dashboard" (Explore. Discover. Endure.), with a huge planet hero, bold condensed display type, glassy translucent cards and thin lines.

## Rules (keep the science)

- **Every body uses NASA data so features sit in the right place:**

  | Body | Source | Notes |
  |---|---|---|
  | Moon | NASA SVS CGI Moon Kit (LRO LROC WAC colour mosaic + LOLA elevation), svs.gsfc.nasa.gov/4720 | equirectangular, longitude 0 at centre, matches MOON_ME |
  | Earth | NASA Visible Earth Blue Marble Next Generation | |
  | Sun | NASA SDO/AIA 304 Å full-disc image (credit NASA/SDO and the AIA science team) | |
  | Stars | NASA SVS Deep Star Maps (Hipparcos/Tycho-2 positions), svs.gsfc.nasa.gov/4851 | |

- **Positions come from the app's ephemeris:** Sun and Earth directions from the JPL Horizons data (`vectorsAt`). No invented positions.
- **Size budget:** textures ≤ 2048 px and about 2.5 MB total, lazy-loaded after first paint, with a `prefers-reduced-motion` static fallback.
- **Tokens only:** colours come from `web/src/styles/tokens.css`. No NASA logos. AI-assisted media carries a visible note.

## Story page (replaces the dense welcome screen)

A sticky full-screen 3D scene; scrolling drives the camera and time.

| # | Scroll section | Visual | One-line text |
|---|---|---|---|
| 0 | Hero | Earth in the foreground, the Moon far away, real stars | "Launching to the Moon? First, choose where to land." |
| 1 | Fly to the Moon | Camera travels; the Moon grows (real craters) | "The south pole has ice, and almost endless daylight on some ridges." |
| 2 | South pole | Moon turns to the south pole; pins on Connecting Ridge, Shackleton Rim, Nobile Rim 1 (real lat/lon) | "But one ridge can block the Sun." |
| 3 | Sunlight | Real Sun direction for a date sweeps the terminator across the pole as you scroll (hours pass) | "Sunlight skims the horizon: power comes and goes." |
| 4 | Earth link | Earth (Blue Marble) at its real direction, bobbing with libration | "Earth rises and sets too: so does your radio link." |
| 5 | Call to action | 4 glass cards: Compare sites · Find dates · Walk the surface · How we know | "Pick a place and a time, and see why." |

## Checklist (tick and push after each item)

- [x] 0. This plan pushed
- [x] 1. NASA textures downloaded, resized and credited (`web/public/textures/`, `pipeline/make_textures.py`, `docs/DATA_SOURCES.md`)
- [x] 2. `web/src/components/story/StoryScene.tsx`: Three.js scene (stars, Moon, Earth, Sun) with a scroll-driven camera and time (lazy-loaded); verify crater and continent orientation (Mare Crisium dark at 17° N 59° E; Africa facing the correct way)
- [x] 3. `Welcome.tsx` replaced by the story sections + CTA cards; remove dense text
- [x] 4. Visual system: deeper space palette, glass cards, display type scale, subtle nav; check light-mode contrast still passes
- [x] 5. Smooth motion: eased scroll (lerp), section fade-ins, reduced-motion fallback; 60 fps on a laptop, no layout shift
- [~] 6. Trim dense copy in workspaces (Explain-mode text stays; Planner mode shows numbers only); shorten About to essentials plus links
- [x] 7. Update e2e tests for the new welcome (`smoke_test.py` welcome step, `journey_test.py` step 1)
- [ ] 8. Screenshots plus mobile check; push; optionally re-run the Pages deploy (Actions → "Deploy to GitHub Pages" → Run workflow)

## How to continue (for any assistant)

- **Run locally:** `cd web && npm ci && npm run dev`.
- **Tests:** `npm test && npm run lint && npm run build`, then the browser smoke test from the README.
- **Push:** keep pushing to `Muxsinjon/new_luna` `main` after each checklist item.
- **CLAUDE.md:** the rules there still apply (tokens, UTC, units, sources, no NASA logos).

## Progress notes

- **Story scene (2026-11-15):**
  - `StoryScene.tsx` maps MOON_ME to three.js as `(x, z, −y)`, which keeps the LRO texture's longitude 0 at +X.
  - Sun and Earth come from `vectorsAt` (JPL Horizons). Sunlight and Earth-link views look across the south pole along each body's real horizontal direction.
  - Distances are compressed (Earth at 28 Moon radii), and the Sun disc is drawn at 5× size.
  - The star field is aligned with the ecliptic and rotated to match the Sun direction (about ±2°, approximate).
- **Tests:** `smoke_test.py` and `journey_test.py` now expect the "Launching to the Moon" heading, and smoke ignores the headless-renderer "GPU stall" driver notice.
- **Dense text (step 6, partial):** every `.hint` note is clamped to two lines and expands on click (`App.tsx` listener plus `workspaces.css`). Screen readers still get the full text.

## Next steps for the next assistant (in order)

1. **Shorten the About page** (`web/src/components/About.tsx`) to five short blocks: what it does, data sources (one line each), how accurate, limits, links to `docs/`. Keep every numeric claim that the tests check (`2031-12-31 18:00 UTC`, "not a radio link budget").
2. **Story polish:**
   - On phones (< 600 px) put the story cards at the bottom of the screen so the 3D scene stays visible.
   - Add a scroll hint to the hero.
   - Optionally show the Earth's terminator glow and a faint lunar-limb glow.
3. **Workspace headers:** one sentence each; move long explanations into the collapsible notes or Explain mode.
4. **Fonts (optional):** a self-hosted display face (OFL, e.g. Space Grotesk or Sora) for headings, added to `web/public/fonts/` with its licence and SHA-256 like Barlow. No external font requests (the journey test blocks them).
5. **Verify and ship:**
   - Run `npm test && npm run lint && npm run build`.
   - Run `python tests/e2e/smoke_test.py http://localhost:4173/` and `python tests/e2e/journey_test.py http://localhost:4173/` (the journey test refreshes the demo screenshots).
   - Push, then GitHub → Actions → "Deploy to GitHub Pages" → Run workflow.
- **Realism and inside design (2026-11-15):**
  - Earth shader with Blue Marble day and Black Marble night lights, ocean glint and atmosphere rim. Sun as the SDO disc with glow in the story, and a white-hot disc in Surface View (how the Sun looks from the Moon).
  - Real stars in Surface View.
  - Palette: moonlight accent `#e9e2d0` (Sun gold and Earth blue keep their meanings), warm text, and the Unbounded display face (self-hosted, OFL) for titles.
  - A 3-step plain-language guide (`GuideStrip.tsx`) on Compare, Finder, Surface and Terrain, which users can hide.
- **Simple view (2026-11-15):**
  - New visitors get a simple view by default: state `full` = false, URL `ui=simple`.
  - Expert sections carry the class `adv` and are hidden by `.ui-simple .adv`. The header's "Show all controls" button reveals them, and the choice is kept in the URL.
  - Hidden in Simple view:
    - header toggles (visibility model, audience, time zone);
    - finder limits (joint, darkness, blackout, terrain requirement, weights, start spacing, filters);
    - compare: the mission validation card, the model label and the "more" details;
    - terrain: the shared threshold form, quality notes, coordinate inspector, hazard and science panels, and sources.
  - The e2e suites use `ui=full`, and smoke checks Simple view.
