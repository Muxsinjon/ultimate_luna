# Milestone 9: final release gate (integration, scientific QA, demo)

Date: 2026-11-15. Branch `milestone-9`, based on Milestone 8 (`1c0017d`). Canonical repository: `Muxsinjon/new_luna`. `Muxsinjon/lunawindow` is untouched.

## All nine milestones

| # | Milestone | Status | Evidence (features and sources) | Docs |
|---|---|---|---|---|
| 1 | Real Site01 3D terrain | **Complete** (imagery registration **unverified**, so WAC is off by default and labelled) | NASA PGDA product 78 Site01 5 m DEM → 20 m mesh. All 160,801 mesh heights equal native samples. Browser picks are within 0.19 m of native bilinear heights. | [M1](MILESTONE1_ACCEPTANCE.md), [TERRAIN_3D](TERRAIN_3D.md) |
| 2 | Slope, roughness, hazard footprints | **Complete** | 3×3 OLS slope (15 m), 5×5 detrended RMS (25 m), three-state screen, footprints. Browser vs raster: 0.0005° and 0.0003 m. Estimator discrepancy vs NASA slope documented (0.51° RMS). | [M2](MILESTONE2_ACCEPTANCE.md), [slope study](SITE01_SLOPE_DISCREPANCY.md) |
| 3 | Multi-site 3D comparison | **Complete** | Site04 Shackleton Rim and Site06 Nobile Rim 1. Generalised pipeline reproduces Site01 byte for byte. Dual linked views; equal-footprint table counts match an independent numpy count. | [M3](MILESTONE3_ACCEPTANCE.md) |
| 4 | Sun/Earth geometry | **Complete** (audit, then gaps) | JPL Horizons topocentric, 9 sites × 38 in-coverage epochs: Sun ≤ 0.0009°, Earth ≤ 0.0059°, Earth phase ≤ 0.006 pp. Cubic upsampling. Coverage ends 2031-12-31 18:00 UTC. | [M4](MILESTONE4_ACCEPTANCE.md), [VALIDATION](VALIDATION.md) |
| 5 | Terrain-aware sunlight and Earth line of sight | **Complete** | 3D shadows: horizons vs a native 5 m reference, median 0.01–0.04°, p95 0.28–0.67° (inner region). PGDA AVGVISIB median difference 0.9–2.0 pp. Shackleton PSR never lit. Hourly vs 10-minute ≤ 0.01 pp. | [M5](MILESTONE5_ACCEPTANCE.md) |
| 6 | Explainable mission-date recommendation | **Complete** | Terrain hard requirement (unknown terrain is insufficient data), visible weighted score, ranking re-derived independently from the export (114 candidates) | [M6](MILESTONE6_ACCEPTANCE.md) |
| 7 | Immersive surface view, optional VR | **Complete for desktop; VR partial** (the WebXR session is implemented but only the unsupported path was tested, as no headset was available) | First person on the 5 m mesh. Directions equal Milestone 4 within 1e-6°. A pixel probe confirms the Sun is hidden or drawn exactly as computed. Horizon vs planner mask, median 0.19–0.62°. | [M7](MILESTONE7_ACCEPTANCE.md) |
| 8 | Optional science overlays | **Partial by design** (2 of 7 candidate datasets integrated; others deferred or rejected with reasons) | Diviner PRP (model) at three sites; ShadowCam Shackleton mosaic (observed). Diviner maximum temperature 87.6 K in PSR vs 279.5 K outside. | [M8](MILESTONE8_ACCEPTANCE.md) |
| 9 | Release gate | **Complete** (see below), with team actions still open | Full journey offline, accessibility tree audit, mobile, no-WebGL fallback, provenance in exports, official rules verified, demo script | this file, [DEMO_SCRIPT](DEMO_SCRIPT.md), [SUBMISSION](SUBMISSION.md), [CHANGELOG](../CHANGELOG.md) |

## Milestone 9 work

**End-to-end journey** (`tests/e2e/journey_test.py`). It runs on real data, and **every request to a non-local host is aborted**. The app makes no external runtime requests: all data is shipped and checksum-verified, and fonts are self-hosted.
1. **Landing page:** load it and choose Shackleton Rim and Nobile Rim 1.
2. **Charts (2027-01-01, 14 days):** terrain-aware Sun and Earth charts and full / partial sunlight rows.
3. **3D comparison:** both sites with the hazard overlay. Equal-footprint screen (≤ 20°, ≤ 1 m, 100 m, 90 %): Shackleton fails at 0 %, Nobile Rim 1 passes at 99.5 %.
4. **Lighting:** the sunlight layer computed for both sites.
5. **Finder (January 2027):** the top recommendation is **Nobile Rim 1 from 2027-01-07 00:00 UTC**. It meets every requirement: Sun 64 %, Earth 68 %, longest darkness 60 h, longest blackout 107 h, score 0.749, rank 1 of 242.
6. **Hand-off:** "Open in Surface View" leads to 3D first person, looking at the Sun, and time stepping.
7. **Exports and sources:**
   - The scenario JSON and mission summary JSON carry provenance (UTC, coordinates, units, AI disclosure, no-endorsement statement).
   - The share link restores the state in a new tab.
   - The About page shows sources and limits.
8. **Mobile:** all six workspaces at 390 px with no overflow.

Evidence screenshots are in `docs/screenshots/demo/`.

**Accessibility:**
- Chrome's computed accessibility tree (DevTools `Accessibility.getFullAXTree`) shows no interactive control with an empty accessible name on any workspace visited.
- Keyboard: 3D canvases accept arrow keys (and W A S D in first person); the panorama accepts W A S D look; Explore and Compare and Surface View accept ←/→ time steps.
- Existing Lighthouse reports remain in `docs/lighthouse`.

**Fallbacks and error states:**
- **No WebGL** (`--disable-3d-apis`, `gpu_fallback_test.py`): the 3D views explain the problem; the panorama, charts and finder work.
- **Loading errors:** checksum mismatch with retry (terrain), missing analysis metadata (hazard), missing horizon inputs (first person) and missing terrain coverage (fallback) are each tested in their suites.
- **WebXR unsupported:** an explicit message.

**Provenance and AI disclosure (rules verified on the official site on 2026-11-15):**
- an `ai-assistance` meta tag;
- `provenance` in every export;
- a visible watermark on the only produced image;
- no NASA branding in the repository (checked by search).

**Code audit (searches over `web/src` and the pipeline):**
- no `console.log`, `TODO` or `debugger`;
- no `any` in physics code;
- no secrets;
- no runtime external fetches;
- the largest tracked file is the preserved 36 MB Milestone 1 archive, and no raw NASA archives are tracked.

**Bugs fixed in this milestone:**
1. **Repeated 10 MB download:** the single-site hazard panel and the compare panes each downloaded the 10 MB hazard layers. A quick mode switch cancelled one download and restarted it, which caused the intermittent `ERR_ABORTED` noted in Milestones 7 and 9. A shared session cache (`loadSiteHazards`) fixes both. The compare suite then passed three times in a row.
2. **README out of date:** test counts, deploy description (manual-only Pages workflow), live-demo version note, references (PGDA 78/90, Diviner, ShadowCam) and AI disclosure were stale.

## Final test results (2026-11-15, after all fixes)

| Suite | Result |
|---|---|
| Vitest (16 files) | **127 passed** |
| Python `unittest` (7 modules) | **34 passed** |
| `tsc`, ESLint, Prettier, `npm run build` | 0 errors |
| Browser suites: smoke (10 flows), terrain, hazard, terrain compare (3/3 consecutive), astronomy, lighting, finder, surface 3D, science, journey, no-WebGL | **All pass** (final rerun results in the commit message) |

## Independent validation errors (summary)

| Quantity | Reference | Error |
|---|---|---|
| Mesh heights | native PGDA 5 m GeoTIFF | 0 (exact samples); decimation residual 0.25–0.38 m RMS |
| Slope / roughness in browser | independent Float32 rasters | ≤ 0.0005° / 0.0003 m |
| Sun / Earth direction | JPL Horizons topocentric | ≤ 0.0009° / ≤ 0.0059° |
| Earth illuminated fraction | Horizons quantity 10 | ≤ 0.006 percentage points |
| 3D horizon (inner crop) | native 5 m + 240 m reference | median 0.01–0.04°, p95 0.28–0.67°, max 1.9° |
| Long-term sunlight | PGDA AVGVISIB (120 m, 18.6 yr) | median abs difference 0.9–2.0 pp, correlation 0.90–0.98 |
| Hourly sampling | 10-minute resampling, 81 site-years | ≤ 0.01 pp of time; 14 sub-hour flickers missed |
| Diviner and ShadowCam layers | raw PDS rows and pixels | within quantisation |

## Known scientific limitations

- **Source DEMs:** the 5 m DEMs are about 90 % interpolated. The 20 m mesh misses features smaller than about 20–40 m, boulders and small craters.
- **Terrain beyond the crop:** only 240 m resolution.
- **Imagery:** LROC WAC registration is unverified (off by default); NAC is not integrated.
- **Hazard thresholds:** illustrative, with no propagated slope uncertainty and no safety certification.
- **Sampling:** hourly. Near the pole a 0.5° horizon error can move a local sunrise or sunset by an hour or more.
- **Earth line of sight:** not an RF link budget. The power model is simple (no thermal, dust or degradation).
- **Diviner layers:** model output from 2009–2010 fits; ice-stability depth is not evidence of ice; registration to LOLA is not independently verified (the PSR agreement is supporting evidence).
- **Coverage:** the ephemeris covers 2023-01-01 to 2031-12-31 18:00 UTC, with no extrapolation.

## Performance

| Item | Measured |
|---|---|
| Initial JavaScript | 23 KB gzipped (index chunk); workspaces lazy-loaded |
| Three.js chunk | 83 KB gzipped, loaded only by 3D views |
| Terrain data | 13 MB per 5 m site (hazard layers 10 MB, fetched on demand and cached per session; elevation and uncertainty 1.3 MB; illumination 1.4 MB; science ≤ 0.4 MB) |
| Dual 3D load | 2.4–3.7 s with the software renderer |
| Shadow field | 0.14 s per site per hour (101 × 101 points) |
| Finder search | sub-second for 2 sites × 1 month at 6 h spacing (prefix sums) |

## Unresolved items (plain statement)

1. **Repository visibility and deployment:** at the user's request, `Muxsinjon/new_luna` was made **public** on 2026-11-15, and it opens without a login. Its commit history includes one teammate's personal email on 7 commits; the user chose to publish as is. The Pages workflow is still manual-only, so no live site of the current version is deployed.
   - The older public site (`muxsinjon.github.io/lunawindow`) shows the pre-milestone version.
   - Per the release-control rule, nothing has been published or deployed without your explicit decision.
2. **Demo:** the demo video or slides, team names and the submission form are still to be produced by the team; see [DEMO_SCRIPT.md](DEMO_SCRIPT.md) and [SUBMISSION.md](SUBMISSION.md). The deadline is **2026-11-15 23:59 local-event time**.
3. **WebXR:** not tested on a headset.

## Run the final demo

```bash
cd web
npm ci
npm run build
npx vite preview --port 4173
```

Then, from the repository root, in another shell:

```bash
python tests/e2e/journey_test.py http://localhost:4173/
```

This needs Playwright and numpy, for example the `pipeline/.venv`.

Or open http://localhost:4173/ and follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md).
