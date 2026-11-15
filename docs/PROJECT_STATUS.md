# LunaWindow project status

Updated 2026-11-15. Branch `milestone-9` on `Muxsinjon/new_luna`, based on Milestone 8 (`1c0017d`). **All nine milestones have been worked through.**
- Milestones 1–6 are complete.
- Milestone 7 is complete on desktop; WebXR has not been tested on a headset.
- Milestone 8 is partial by design (2 of 7 datasets integrated).
- Milestone 9 (release gate) is complete.

## Milestone 9: release gate

- **Journey:** the full user journey passes on real data with all external requests blocked. Top recommendation: Nobile Rim 1 from 2027-01-07 00:00 UTC, meeting every requirement, score 0.749.
- **Quality checks:** accessibility-tree audit, 390 px layout, no-WebGL fallback.
- **Provenance and AI disclosure:** in every export and in page metadata; the share image carries a visible watermark.
- **Rules:** checked against the official 2026 Project Submission Guide.
- **Fixed:** repeated or cancelled 10 MB hazard downloads (shared session cache).
- **Open team actions:**
  - the repository is now public (2026-11-15); optionally deploy the site;
  - record the 30 s demo or make the 7 slides;
  - fill in the submission form before 2026-11-15 23:59 local-event time.

See [Milestone 9 acceptance](MILESTONE9_ACCEPTANCE.md), [demo script](DEMO_SCRIPT.md) and [submission kit](SUBMISSION.md).

## Milestone 8: completed (preserved)

- **Feasibility audit:** all seven candidates were checked over verified HTTPS.
- **Integrated:**
  - Diviner Polar Resource Products (model-derived temperatures and ice-stability depth) at all three 5 m sites;
  - the ShadowCam controlled Shackleton mosaic (observed I/F) where it covers the crop.
- **Deferred or rejected, with reasons:** UCLA L4 (TLS failure), ShadowCam DTMs, LEND, Mini-RF, M3 and CRaTER.
- **Framework:** a reusable per-site layer framework with toggles, opacity, legend, model/observation labels, coded states (an undocumented −1 source code is shown but never interpreted), provenance hashes and caveats.
- **Validation:** Diviner's maximum temperature is 87.6 K inside PGDA permanent shadow vs 279.5 K outside.
- **Also fixed:** a real URL-hash race in `App.tsx` that caused intermittent navigation loss.

See [Milestone 8 acceptance](MILESTONE8_ACCEPTANCE.md).

## Milestone 7: completed (preserved)

- **Verified existing:** the 360° horizon panorama, now also the fallback.
- **Added:** a 3D first-person view on the three 5 m sites. It uses:
  - the same verified mesh;
  - the Milestone 4 Sun/Earth directions (true angular sizes, Earth phase from lighting);
  - the Milestone 5 computed shadows;
  - the 240 m silhouette beyond the crop;
  - a black sky.
- **Controls and overlays:** walking, look-at buttons, field of view, eye height, a horizon-profile overlay and hazard spots.
- **WebXR:** offered only when supported, look-around only.
- **Proof:** view directions equal the Milestone 4 values within 1e-6°. Rendered Sun pixels are hidden or visible exactly as the horizon calculation says. The horizon matches the planner mask within a median of 0.2–0.6°.

See [Milestone 7 acceptance](MILESTONE7_ACCEPTANCE.md).

## Milestone 6: completed (preserved)

- **Verified existing:** finder search, thresholds, statuses, coverage handling, explanations, overview grid and hand-offs.
- **Added:**
  - an optional hard terrain requirement on the 5 m sites (unknown terrain is insufficient data, never a pass);
  - soft preference weights with a visible normalised score and contributions;
  - deterministic ties;
  - URL persistence;
  - a downloadable reproducible scenario and results;
  - "Open in 3D terrain".
- **Default weights** reproduce the previous ranking exactly.
- **End to end on real data:** Shackleton Rim fails the illustrative terrain screen (0 %), while Nobile Rim 1 passes (99.5 %). The ranking re-derives independently from the downloaded components.

See [Milestone 6 acceptance](MILESTONE6_ACCEPTANCE.md).

## Milestone 5: completed (preserved)

- **Verified existing:** planner horizon masks (240 m, 250 km, exact sphere, 2 m observer), both visibility models, partial-disc handling, combined timelines and blackout metrics, and the AVGVISIB overlays.
- **Added:** time-dependent sunlight and Earth line-of-sight layers on the 3D terrain sites (single and compare views), plus NASA's 20 m PSR map as static context.
- **Added:** full / partial / disc-weighted sunlight metrics, and a bounded statement of what hourly sampling misses.
- **Validation:**
  - Horizons vs a native 5 m reference: inner median 0.01–0.04°, p95 0.28–0.67°.
  - Long-term sunlight vs NASA AVGVISIB: median difference 0.9–2.0 percentage points, correlation 0.90–0.98.
  - Shackleton PSR points: never lit.
  - Hourly vs 10-minute sampling: at most 0.01 percentage points.

See [Milestone 5 acceptance](MILESTONE5_ACCEPTANCE.md).

## Milestone 4: completed (preserved)

- **Verified existing:** Horizons preprocessing (MOON_ME, DE441), topocentric ENU geometry including libration, both horizon models, the time slider and shared state, and Earth's angular size.
- **Improved:** cubic upsampling of the shipped ephemeris. Earth interpolation error fell from 0.0048° to 0.0014° max.
- **Fixed:** Earth phase is now a tested pure function and includes the Sun's Earth–Moon parallax.
- **Added:** Sun and Earth rays plus an az/el readout in the 3D terrain views, and a time bar there.
- **Validation:** 9 sites × 40 Horizons epochs. Sun is within 0.0009°, Earth within 0.0059°, Earth phase within 0.006 percentage points.
- **Coverage end corrected:** 2031-12-31 18:00 UTC.

See [Milestone 4 acceptance](MILESTONE4_ACCEPTANCE.md).

## Milestone 3: completed (preserved)

- **Sites:** Site01 (Connecting Ridge), Site04 (Shackleton Rim) and Site06 (Nobile Rim 1) are processed by one generalised pipeline (`pipeline/terrain_sites.py`). The Site01 rebuild is byte-identical to Milestones 1 and 2.
- **UI:** a "Compare A and B" mode with two 3D views, linked cameras, shared thresholds, an equal-footprint comparison table, trade-off text and navigation that keeps sites and dates.
- **Planner catalogue:** two new entries at the DEM centre pixels; the other 17 sites are unchanged.
- **Tests:** 81 JS, 19 Python, plus the new dual-view e2e and the legacy terrain, hazard and smoke suites, all passing.
- **Default result:** both DEM-centre footprints fail the illustrative 10° / 0.3 m / 90 % screen, and the UI says so.

See [Milestone 3 acceptance](MILESTONE3_ACCEPTANCE.md).

## Milestone 2: completed (preserved)

The existing 3D explorer now has native-resolution source-derived slope, roughness and configurable hazard overlays, point measurements, thresholds and circular footprint statistics. Geometry and camera are preserved across analysis layer changes. No remote updates, PRs or deployment were performed.

- **Source science:** verified existing 5 m Site01 DEM; 3×3 OLS slope (nominal 15 m support), 5×5 detrended residual RMS (25 m support). The 20 m mesh remains rendering only. NASA's compatible Site01 slope raster was downloaded/verified for comparison; existing height RMS is retained.
- **Suitability correction:** directory product 98 currently describes north-pole roughness; south-pole regional metrics have different definitions/baselines and are not substituted for local 25 m roughness.
- **Screening:** illustrative configurable maximum slope/RMS, three explicit states, point exceedance reasons, 5 m sample-centre circular footprint with min/mean/max values, fraction meeting criteria and unavailable coverage. Missing data never imply favorable terrain.
- **Validation:** 73 JS tests, 11 Python tests (no skips), lint, format, build, existing smoke and terrain suites, and new scientific browser checks pass. Browser-vs-raster point differences: 0.000473904° slope / 0.000314077 m RMS; independent 100 m disk count matches 1260 samples. All footprint summary differences are ≤0.0005 in their units.
- **Comparison caveat:** independent OLS reference agrees below 1e-9, but NASA supplied slope differs by 0.505067° RMS / 15.244853° maximum. The numerical stencil/support is not established by its README; exact official-product equivalence is not claimed.
- **Limits:** source DEM is ~90% interpolated; roughness can be comparable to source height error. No propagated confidence intervals, boulder/crater detection, dynamics/bearing-capacity verification or safety certification. Thresholds act on values rounded at 0.001° / 0.001 m. Footprint coverage is sample-based; analysis controls are not added to mission URLs.

See [Milestone 2 acceptance](MILESTONE2_ACCEPTANCE.md), [structured data inventory](DATA_SOURCES.md), and [numerical browser evidence](data/MILESTONE2_BROWSER_VALIDATION.json). Source downloads and full-precision scientific GeoTIFFs stay ignored; reproducible processing is `pipeline/hazard_site01.py`.

## Milestone 1 final acceptance (preserved baseline)

**Core terrain explorer accepted for local review, with WAC registration explicitly unverified and disabled by default.** Full evidence for every acceptance requirement is in [MILESTONE1_ACCEPTANCE.md](MILESTONE1_ACCEPTANCE.md).

| Requirement | Result and evidence |
|---|---|
| LROC WAC alignment | Map projection, extent and UV checks pass, but independent landmark registration accuracy is **unverified**. Dark/coarse imagery supplies no defensible control set. Texture is **off by default**; selector and persistent warning explicitly say unverified. [Review](data/SITE01_REGISTRATION_REVIEW.json). |
| Google Fonts issue | Safely resolved by self-hosting the same four licensed Barlow font faces. No trust-store changes/TLS bypass. All four load locally; zero external HTTP requests in terrain acceptance; nested `/lunawindow/` production paths checked. [Sources/licenses](../web/public/fonts/SOURCES.md). |
| Selected coordinates/elevations | 101 independent native-source reference samples pass. Five actual browser ray picks differ from native 5 m bilinear heights by at most **0.1865 m**, and from source-derived 20 m triangles by less than **0.00005 m**. Numeric entry agrees with independent 20 m bilinear sampling within 1e-5 m. [Evidence](data/SITE01_BROWSER_PICKS.json). |
| Native 5 m → rendered 20 m | All **160,801 mesh elevations** exactly equal every fourth native pixel in the real GeoTIFF crop. No newly fabricated/filled heights. Source/asset hashes and six geographic checkpoints pass. [Tests](../pipeline/test_terrain_site01.py). |
| Full checks | **69 JS tests, 6 Python tests (no skips), lint, formatting, build, unchanged 10-flow smoke suite, terrain browser suite and all 10 existing workspace screenshots pass.** Smoke/screenshots report no console errors or warnings. |
| Documentation | Final results, interpolation limits, source attribution, font licenses, local PR description and reproducible evidence updated. No remote changes. |

## Implemented

Separate lazy Three.js workspace renders real NASA PGDA Connecting Ridge Site01 elevation and RMS uncertainty: an 8 × 8 km curved lunar mesh at 20 m spacing from the verified 5 m GeoTIFF. It supports orbit, zoom, pan, reset, touch/keyboard controls, ray picking, coordinate entry, elevation/RMS readouts and Site A/B planner integration. Existing mission finder, comparisons, ephemeris, regional horizons and 360° Surface View remain intact.

Optional real NASA Moon Trek LROC WAC imagery is map-projected onto the exact mesh extent, with tile hashes and source transforms recorded, but its independent image-to-terrain registration is **not validated**. WAC is ~100 m nominal context, often dark at the pole, and its metadata quotes 12–300 m absolute accuracy. It is not high-resolution NAC or metre-scale ground truth.

## Quantified limits

- NASA's 5 m source is itself ~90% interpolated between laser returns. Pixel size is not independent measurement accuracy.
- Mesh decimation residual against the native interpolated DEM: **0.2526 m RMS, 0.5125 m p95 absolute, 8.1865 m maximum**, over 2,563,201 samples. This is separate from NASA source RMS uncertainty and image registration error.
- The five tested ray picks are representative checks, not a claim that their 0.1865 m maximum applies globally. UI decimals are not accuracy claims.
- Planner custom-site elevation and 250 km horizons still use the original 960 m regional DEM and can differ from local high-resolution readings.
- Inspection lighting and photographed texture shadows are not physical shadow simulations for mission time.
- WebGL screenshot capture on the software renderer emits counted `ReadPixels` performance warnings. No other application/browser errors or failed requests remain in the acceptance run.
- Vite retains the advisory for the lazy Three.js chunk (>500 kB uncompressed, ~144 kB gzip). No check is suppressed to hide this advisory.

The previous Google Fonts proxy-certificate failure is resolved at the application level by local font assets. Browser/system trust is unchanged. Independent WAC landmark co-registration remains the substantive unverified item, handled by the default-off policy requested for acceptance.

## Review and reproduction

See [TERRAIN_3D.md](TERRAIN_3D.md) for source metadata and commands, [MILESTONE1_ACCEPTANCE.md](MILESTONE1_ACCEPTANCE.md) for final evidence, and [local PR draft](PULL_REQUEST_MILESTONE_1.md) for later review. Run `cd web && npm run dev`, choose **3D Terrain**, and select **Site B** or **Show Connecting Ridge**. Use the existing isolated checkout; do not create an extra Git worktree for routine cloud development.

## Slope discrepancy follow-up

Full-crop investigation identifies estimator weighting as dominant, not NoData/resampling/edge or pixel-alignment errors. Four-neighbour projected central reconstruction agrees with NASA to 0.000272° RMS / 0.010948° maximum. Production OLS remains independently valid and unchanged; UI labels and a persistent warning explicitly disallow equivalence to NASA's raster. OLS p95/p99 differences are 1.031814° / 1.955439°; 1183 cells exceed 5° difference, 45 exceed 10°. At 10° / 0.3 m defaults, swapping only the slope estimator flips 42,410 combined decisions (1.654572%). Exact small central-gradient residuals are not fully explained. See [investigation and locations](SITE01_SLOPE_DISCREPANCY.md). Follow-up checks: 73 JS tests, 14 Python tests, lint/format/build and existing smoke/M1 terrain/M2 hazard suites pass. No remote changes.
