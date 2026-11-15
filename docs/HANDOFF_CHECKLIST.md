# LunaWindow handoff checklist (for the next assistant, e.g. GPT)

Status on 2026-11-15:
- **Repository:** https://github.com/Muxsinjon/new_luna (public), branch `main`.
- **Live site:** https://muxsinjon.github.io/new_luna/ (GitHub Pages, deployed by hand: Actions → "Deploy to GitHub Pages" → Run workflow).
- **Do not modify:** `Muxsinjon/lunawindow` (old version, kept unchanged).
- **Space Apps deadline:** **Sunday 2026-11-15, 23:59 local-event time**.

## Done

### Science milestones (each has `docs/MILESTONE<N>_ACCEPTANCE.md` and `milestones/MILESTONE_<N>.patch`)
- [x] **M1:** real NASA PGDA 5 m terrain of Site01 (Connecting Ridge) as a 20 m 3D mesh
- [x] **M2:** slope (3×3 OLS), roughness (5×5 RMS), hazard footprints
- [x] **M3:** Site04 Shackleton Rim and Site06 Nobile Rim 1; side-by-side 3D comparison
- [x] **M4:** Sun/Earth geometry validated against JPL Horizons (Sun ≤ 0.0009°, Earth ≤ 0.0059°)
- [x] **M5:** terrain-aware sunlight and Earth line of sight in 3D; NASA permanent-shadow layer; hourly-sampling bound
- [x] **M6:** Mission Window Finder: terrain requirement, preference weights, visible score, JSON export
- [x] **M7:** first-person 3D Surface View (WebXR only where supported; not tested on a headset)
- [x] **M8:** Diviner temperature and ice-stability layers, ShadowCam Shackleton image (others deferred, with reasons)
- [x] **M9:** release gate: offline journey test, accessibility, mobile, no-GPU fallback, provenance, demo script, submission kit

### Redesign (plan: `docs/REDESIGN_PLAN.md`)
- [x] Scroll-story home page: "Launching to the Moon? First, choose where to land."
- [x] Real NASA visuals:

  | Body | Source |
  |---|---|
  | Moon | LRO colour + LOLA elevation |
  | Earth | SVS 3615 with clouds, plus Black Marble night lights |
  | Sun | SDO disc in the story; white-hot disc in Surface View |
  | Stars | 8,404 HEASARC BSC5 catalogue stars as crisp points |

- [x] Sun/Earth directions, lighting and phases from JPL Horizons; distances compressed (stated on the page)
- [x] Visual system:
  - deep-space palette and moonlight accent `#e9e2d0` (Sun gold and Earth blue keep their meanings);
  - Unbounded display font, self-hosted;
  - glass header and panels.
- [x] Long notes collapsed to 2 lines (click to expand)
- [x] 3-step beginner guide on Compare, Finder, Surface and Terrain (hideable)
- [x] **Simple view by default**: expert settings hidden until "Show all controls" (URL `ui=simple|full`)
- [x] **"What blocks the Sun and Earth"** (idea from comparing with team Kestro Aerospace): the blocking ridge, its direction and distance, and the hours lost

### Quality (last run 2026-11-15)
- [x] 133 unit tests (`npm test`), 34 Python tests
- [x] Browser suites pass: smoke (11/11), journey (offline), terrain, hazard, compare, astronomy, lighting, finder, surface 3D, science, no-GPU
- [x] `tsc`, ESLint, Prettier and build are clean; no console errors

## Left to do (in priority order)

### Before the deadline (team, not code)
- [ ] **Record the demo:** a video of **30 seconds or less**, or at most **7 slides**, following `docs/DEMO_SCRIPT.md`. Upload it with a public link.
- [ ] **Add team names** to `README.md` (Team section) and to the demo.
- [ ] **Fill in the Space Apps form** with the drafts in `docs/SUBMISSION.md`. Links: repository and live site. Tick both boxes, then **Submit for Judging**.
- [ ] **Recheck the official rules** (Project Submission Guide on spaceappschallenge.org) on the day.

### Design polish (code)
- [ ] **Shorten the About page** (`web/src/components/About.tsx`) to five short blocks: what it does, data, accuracy, limits, links. **Keep** the texts `2031-12-31 18:00 UTC` and "not a radio link budget" (the tests check them).
- [ ] **Phone layout of the story:** below 600 px, put the story cards at the bottom so the 3D scene stays visible, and add a scroll hint to the hero.
- [ ] **One-sentence header per tool page:** move long explanations into the collapsible notes or the expert view.
- [ ] **Surface View terrain look** (optional): the ground is flat grey. Do **not** invent craters: any texture must be real NASA imagery with verified registration. LROC WAC registration is unverified, so it stays off.
- [ ] Optional: show the blocking ridge in the 3D views (a highlight at the azimuth and distance from `lib/blockers.ts`).

### Science extensions (optional)
- [ ] Uncertainty bands on sunrise and sunset from terrain height error (Kestro does this)
- [ ] "How many days can the landing slip?" summary in the finder
- [ ] Ephemeris coverage ends at 2031-12-31 18:00 UTC; extend `fetch_ephemeris.py` if later dates are needed

## How to work on it

```bash
cd web
npm ci
npm run dev                       # http://localhost:5173
npm test && npm run lint && npm run build
npx vite preview --port 4173      # then run the browser tests from the repo root:
python tests/e2e/smoke_test.py http://localhost:4173/
python tests/e2e/journey_test.py http://localhost:4173/
```

- **Python environment:** the browser tests need numpy and Playwright. The pipeline uses `pipeline/.venv` (numpy, rasterio, scipy, Pillow, Playwright).
- **Deploy:** push to `main`, then GitHub → Actions → **Deploy to GitHub Pages** → **Run workflow** (about 3 minutes). Users may need Ctrl + F5.

## Rules and pitfalls

- **Project rules in `CLAUDE.md` apply:**
  - colours only from `web/src/styles/tokens.css`;
  - UTC, units on every number, hourly samples, no sub-hour claims, no extrapolation beyond 2031-12-31 18:00 UTC;
  - every scientific number cites its NASA source;
  - no NASA logos;
  - log AI-assisted work in `docs/AI_USAGE.md`.
- **Simple view hides elements marked `className="adv"`.** The browser tests open pages with `#ui=full&ws=...`; keep that, or the tests can't find expert controls.
- **Headless Chromium** prints "GPU stall due to ReadPixels" on WebGL pages. This is a driver notice, and the tests ignore it.
- **The app makes no external requests** (fonts and data are self-hosted). The journey test blocks the internet to prove it, so keep new assets local.
- **Textures and stars** are rebuilt by `pipeline/make_textures.py` and `pipeline/make_stars.py`; credits are in `docs/DATA_SOURCES.md`.
- **Prettier reformats long lines:** read a file again before making exact-text edits.
