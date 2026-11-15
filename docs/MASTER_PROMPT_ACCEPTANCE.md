# Master prompt acceptance — 15 November 2026

This release implements the supplied `Prompt.txt` in the existing, validated LunaWindow application and uses the attached NASA/JPL source directory to check data suitability. The target is **Muxsinjon/ultimate_luna**; the original `new_luna` repository is unchanged. Website: https://muxsinjon.github.io/ultimate_luna/.

## What this release changes

- The exact requested welcome heading and three immediate actions: Explore landing sites, Plan a lunar mission, and the guided demo.
- A rotatable, selectable whole Moon with actual LOLA elevation displacement at true vertical scale. The imagery is no longer the only surface information on a smooth sphere.
- The simple dashboard exposes coordinates, source references, current Sun/Earth angles, a shared time bar, the visibility model, and expandable charts/comparison. Required darkness and blackout controls are available without enabling expert settings.
- Finder candidates and critical interruptions open the corresponding surface location and time. Geometric mode uses the matching 0° panorama; terrain mode can use the measured 3D terrain. This prevents displaying terrain-obstructed 3D visibility while reporting geometric-only metrics.
- Core scientific assets are verified against SHA-256 hashes pinned in the application bundle. Metadata, vector units, coordinates, horizon completeness and grid sizes are checked before use. A corrupted ephemeris produces an explicit error and a working retry.
- The shareable URL updates before the changed selection is painted, so an immediate reload or copied link retains the location. A regression run exposed the previous deferred-update race.
- Existing fixes for stale Finder results, incomplete mission coverage, terrain requirements in exports, camera keyboard shortcuts and theme changes remain covered by regressions.

## Requirement traceability

| Supplied prompt | Implemented behavior | Evidence / implementation |
|---|---|---|
| 1–2, 8: integrated application and shared mission state | Persistent navigation; site A/B, mission/search periods, requirements, model and selected time survive workspace and URL changes | `lib/state.ts`, `store.tsx`, `App.tsx`; state, smoke, journey and improvements tests |
| 3: welcome and onboarding | Exact heading, direct Explore/Plan actions, optional real-data guided demo, no account | `Welcome.tsx`, `GuidedDemo.tsx`; master-prompt and smoke tests |
| 4.1: sourced map/site selection | Rotatable LOLA globe, A/B markers, zoom, keyboard/pointer selection, coordinate entry, cited site dropdowns; unverified coordinates flagged | `MoonGlobe.tsx`, `SitePair.tsx`, `globalTerrain.ts`; globe, custom-site and master-prompt tests |
| 4.2–4.5: dates, angles, synchronized charts and timeline | Hourly UTC time bar, playback, Sun/Earth azimuth/elevation, 0° chart references, tooltips, four visibility combinations, clickable intervals, differences | `TimeBar`, `ElevationChart`, `CompareLanes`; analysis/visibility unit tests and smoke tests |
| 4.6–4.7: comparison and actions | Percentages, continuous intervals, darkness/blackouts and interruption counts; generated trade-offs; Finder, Surface, reset and summary actions | `CompareTable`, `MissionDashboard`, `ExploreCompare`; smoke and journey tests |
| 5.1–5.4: mission search | All required inputs, illustrative defaults, full-duration coverage, four candidate statuses, hard requirements before weighted preferences, sorting/filtering | `finder.ts`, `finderRanking.test.ts`, `MissionFinder`; finder browser test independently reranks 114 candidates |
| 5.5–5.6, 18: why this window and critical moments | Numeric pass/fail reasons, favorable intervals, critical interruptions, alternatives and assumptions; candidate/time handoffs and recalculation | `checkSentence`, Why-this-window panel; finder, journey and improvements tests |
| 6: surface experience | Black sky, real ephemeris directions, cardinal/orientation controls, look-at controls, time playback, below-horizon occultation; 2D fallback and 3D on supported crops | `SurfaceView`, `SurfaceFirstPerson`, `FirstPersonView`; astronomy, surface3d and GPU-fallback tests |
| 7: shared real science | JPL Horizons MOON_ME vectors, validated observer conventions, source metadata, geometric centre >0° versus terrain upper-limb visibility, hourly half-open intervals | `analysis.ts`, `geometry.ts`, `physics/`, `pipeline/validate_astronomy.py`; unit tests and fresh Horizons report |
| 9: summary/export | Printable HTML/browser PDF and JSON with both sites, dates, criteria, actual checks, interruptions, sources and limitations | `MissionSummary`; smoke, journey and improvements tests |
| 10: guided demonstration | Prepared supported-date scenario and interactive walkthrough; results come from the normal scientific engine | `GuidedDemo.tsx`; `DEMO_SCRIPT.md`, smoke and journey tests |
| 11–12: usability and architecture | Responsive dark/light tokens, labels and units, progressive controls, pure tested science separated from UI, Python preprocessing, static deployment | TypeScript strict, lint/build, desktop/mobile screenshots; React API with Preact production runtime, SVG charts and Three.js. Tailwind/Recharts are recommendations, not mandatory dependencies |
| 13: priorities | P0/P1 implemented; summary and additional sites included; measured terrain and 3D added on top of the existing calculation engine | Acceptance tests above; VR remains optional |
| 14: failure cases | Date clamping with explanation, invalid coordinates, no feasible results, missing required terrain, damaged assets, failed/retry loading, workspace changes during loading, no-WebGL fallback | `data.test.ts`, coverage/finder/custom-site tests; master-prompt, GPU-fallback and improvements tests |
| 15–17, 19: tested working delivery | Source code, data pipelines, attribution, setup, methodology, limitations, demo and public deployment; mandatory and competitive user journeys exercised | README, this matrix, validation reports, CI and Pages workflows |

The app uses precomputed observations and does not depend on live NASA API availability during a presentation. The pipeline fails explicitly on invalid API responses. There is no fabricated live fallback.

## Data verification and coverage

- **Global elevation:** independently downloaded the official PDS `LDEM_16.LBL/.IMG` over verified HTTPS. Checked label dimensions, east-positive cylindrical projection, little-endian signed 16-bit samples, 0.5 m/DN and 1737.4 km reference radius. All **1,036,800** browser samples match the independent 4×4 block-average/rounding reduction exactly. [Report](data/GLOBAL_DEM_VALIDATION.json), reproducible with `pipeline/verify_global_dem.py`.
- **Display resolution:** source LDEM_16 is 16 pixels/degree (~1.90 km at the equator), shipped at 4 pixels/degree (~7.58 km); globe vertices are spaced 0.5° (~15.16 km). Bilinear sampling, longitude wrapping and pole closure are tested. Vertical scale is 1:1. This is a measured global shape at overview resolution, not boulder-scale geometry.
- **Detailed terrain:** three 8 km crops from PGDA 5 m DEMs, rendered at 20 m mesh spacing. Native 5 m data supports local slope/roughness screening. Regional horizons use the 240 m south-pole source; browser custom horizons use the 960 m polar reduction or the coarser global grid. [Terrain documentation](TERRAIN_3D.md).
- **Astronomy:** coverage is 2023-01-01 00:00 through **2031-12-31 18:00 UTC**. Six-hour shipped vectors are interpolated to hourly observations; metrics use hourly half-open intervals. The existing independent fixture tests 342 in-coverage site/epoch pairs per body. A fresh API spot check of two sites × three epochs × two bodies found maximum angular separation **0.000726° Sun / 0.006004° Earth** (rounded upward), and maximum elevation differences below 0.001° / 0.006°. [Fresh request settings and observations](data/MASTER_HORIZONS_SPOT_CHECK.json). These are measured validation errors, not a universal error bound.
- **Integrity:** ten core files are pinned by SHA-256. Local terrain/science files retain their existing per-product provenance/hashes. Hashes detect changed bytes; scientific checks establish the relationship to sources.
- **Directory access:** all 16 distinct URLs in the 17-category attachment returned HTTP 200 during this pass. [Access report](data/MASTER_SOURCE_ACCESS.json). This establishes catalogue availability only; it does not establish suitability or validate every product in those catalogues.

## Treatment of the attached source directory

| Categories | Use and limits |
|---|---|
| 01 local elevation; 02 large-area elevation | PGDA Site01/Site04/Site06 and regional LOLA already processed; official global LOLA now drives the overview shape and was independently reverified |
| 03 imagery | Credited NASA LRO global mosaic; local context imagery remains labelled with its registration limitations |
| 04 slope | Native DEM-derived 3×3 OLS slope, independently compared with the official slope product; the two estimators are explicitly not equivalent |
| 05 roughness | Native DEM-derived 5×5 detrended RMS with a stated 25 m support. The linked product 98 is north polar; regional south-pole roughness has different baselines and is not substituted for local RMS |
| 06 Sun; 10 Earth | JPL Horizons apparent geometry, surface-observer checks and lunar longitude/frame conventions; Earth libration retained |
| 07 illumination; 09 average Earth visibility | NASA PGDA long-term context/validation only. Date-specific results come from Horizons plus the selected horizon model |
| 08 permanent shadow | PGDA PSR context on detailed crops; a static PSR classification is not a prediction for one selected hour |
| 11 temperature | Existing Diviner Polar Resource Products, labelled model-derived, with coverage and coded/no-data states. A catalogue page becoming available does not verify a different thermal raster |
| 12 craters/boulders | Terrain slope and roughness screening exists. Automated boulder/crater recognition and a new NAC stereo DTM are not implemented; no hazard-free landing claim is made |
| 13 hydrogen/radar; 14 M3; 16 CRaTER | Optional, not integrated: footprint, interpretation, polar signal and surface-dose modelling limits remain documented in Milestone 8 |
| 15 shadow imagery | Existing observed ShadowCam mosaic where coverage supports it; no invented values outside that footprint |
| 17 SPICE | Optional; the app uses Horizons with validated reference-frame conventions rather than introducing a second unvalidated ephemeris engine |

## Release checks

[Machine-readable results](data/MASTER_RELEASE_VALIDATION.json) · [Welcome](screenshots/master-prompt/welcome.png) · [Finder explanation](screenshots/master-prompt/finder-why.png) · [Surface](screenshots/master-prompt/surface.png) · [Mobile](screenshots/master-prompt/finder-phone.png)

- 150 TypeScript unit tests pass, including source-derived geometry, visibility, terrain, astronomy, coverage, ranking and exports.
- 27 Python tests pass; 7 optional raw-source checks skip because the corresponding local source caches are absent. Skipped tests are not claimed as fresh source validation.
- Production-build browser suites cover smoke, astronomy, lighting, Finder, terrain comparison, first-person 3D, science layers, complete offline journey, no-WebGL fallback, terrain picking, hazards, prior regressions and the new master-prompt checks.
- The new browser test verifies the exact welcome entry, measured global geometry, charts and required constraints in simple view, matching geometric Surface View, mobile layout, corrupted ephemeris rejection and successful retry.
- Desktop/mobile screenshots are inspected. No application console errors or warnings in the tested workflows; the cloud software renderer's driver-only ReadPixels notice is excluded.

## Reproduce

```bash
cd web
npm ci
npm run lint
npm run format:check
npm test
npm run build
cd ..
python pipeline/verify_browser_data.py --check
# In the pipeline Python environment (numpy, requests, rasterio, pyproj, Playwright):
python pipeline/verify_global_dem.py --cache pipeline/raw/global-validation --report global-report.json
python -m unittest discover -s pipeline -p 'test_*.py'
# Start `npm --prefix web run preview -- --port 4173` in another terminal:
python tests/e2e/smoke_test.py http://localhost:4173/
python tests/e2e/master_prompt_test.py http://localhost:4173/
python tests/e2e/journey_test.py http://localhost:4173/
```

The detailed NASA generation pipelines and their validation commands remain in the milestone acceptance documents. Regenerate `dataChecksums.json` with `python pipeline/verify_browser_data.py` only after intentionally rebuilding and validating scientific assets.

## Limits and remaining team actions

This is preliminary decision support. Visibility does not establish a radio link budget, usable panel power, battery sufficiency, thermal/radiation survival, water access or landing safety. A source DEM may contain interpolation and measurement error. Its pixel spacing is not its accuracy. Global and local meshes must not be confused with one another.

WebXR is optional and has not been tested on a physical headset. Browser tests emulate mobile layout; they are not physical-phone performance testing. Optional remote-sensing products and new automated boulder detection are not claimed as finished. The team must review its official challenge eligibility, event requirements and submission; deployment does not submit the project to NASA Space Apps.
