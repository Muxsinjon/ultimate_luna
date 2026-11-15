# Milestone 2 — scientific landing hazard analysis

Completed and tested locally on 2026-11-14, branch `feat/site01-hazard-analysis`, based on preserved Milestone 1 commit `aeb54a6`. No push, remote PR, deployment, remote branch update or Milestone 3 work. This is preliminary terrain screening, not flight-certified landing safety.

## Implemented scope

The existing Connecting Ridge 3D workspace now supports **Elevation, Slope, Roughness and Hazard Assessment** layers. Switching analysis layers preserves camera pose, selected coordinates and terrain geometry. Camera orbit/zoom/pan, ray selection, mission Site A/B integration, WAC default-off/unverified policy, existing regional horizons, astronomy and other workspaces remain available.

Scientific controls configure maximum slope (degrees, nominal 15 m support), maximum roughness (metres RMS, nominal 25 m support), and circular footprint radius (5–2000 m). Defaults 10°, 0.3 m RMS and 100 m radius are illustrative, not NASA standards. Each sample is classified **meets selected terrain criteria / exceeds one or more / insufficient data**. Equality meets a threshold; missing or invalid criteria are unavailable, not favorable. Point readouts explain the offending criterion. Legends provide numeric ranges/units and classification colors.

A selected terrain point anchors a circular boundary and footprint summary: min/mean/max slope, min/mean/max roughness, valid/total samples, sample-based data coverage and fraction of valid samples meeting both criteria. Whole-footprint safety is never inferred from a low mean. Boundary segments outside the available terrain are clipped; the missing portion remains in the statistics denominator.

## Actual NASA sources and suitability

Source directory: [NASA GSFC PGDA product 78](https://pgda.gsfc.nasa.gov/products/78), Barker et al. (2021), doi:10.1016/j.pss.2020.105119.

- Existing `Site01_final_adj_5mpp_surf.tif`: native 5 m elevation, reused without duplicate download; source SHA-256 pinned in the M1 processor.
- Existing `Site01_final_adj_5mpp_toterr.tif`: original height RMS uncertainty remains visible at selected points. It is not substituted for slope/roughness confidence intervals.
- Newly acquired `Site01_final_adj_5mpp_slp.tif`: [exact URL](https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_slp.tif), HTTP 200, Last-Modified 2020-06-08, SHA-256 `3a90035a4946b4a04b7332c52f0b2b1cff71648bd8c105e14d8a7e15c6bcfe8e`. Compatible 3200 × 3200 Float32 grid, 5 m centres, same projection/transform/coverage as the DEM, NaN NoData, scale 1/offset 0. Degrees confirmed in the official README. Loaded for comparison; the new primary slope estimator is explicitly defined below, rather than assigning an unverified spatial support to NASA's supplied slope raster.

All local sources use south-polar stereographic projection on a 1737400 m sphere, central meridian 0, pole −90°, MOON_ME/DE421. Source bounds: X −19000…−3000 m, Y −20000…−4000 m. Analysis matches the existing 8 km crop. [DATA_SOURCES.md](DATA_SOURCES.md) records full metadata, exact source names, intended features and all 17 directory categories without claiming future datasets are integrated.

The attached directory's [product 98](https://pgda.gsfc.nasa.gov/products/98) currently lists **north-pole** roughness: rejected for Site01. [Product 90](https://pgda.gsfc.nasa.gov/products/90) lists south-pole roughness of individual LOLA spot residuals at circular baselines 100–1600 m and sampling 50/1000 m. These are not equivalent to a 25 m square residual metric derived from an interpolated DEM; no regional raster was downloaded or silently substituted. This finding is recorded in the inventory. No new imagery, crater or boulder detector was added.

## Scientific method and physical units

Analysis is performed **before decimation on native 5 m source pixels**, never on the 20 m rendered mesh. For each neighbourhood, fit

`h(x,y) = a x + b y + c`

by ordinary least squares with all finite pixels required. X/Y offsets are projected metres relative to the sample centre. Scalar slope is rotation invariant, so local convergence orientation does not alter its magnitude. The conformal stereographic scale is

`k = 1 + (X² + Y²)/(4 R²)`.

Horizontal distance at the local terrain radius is `d_ground = d_projected (1 + h/R)/k`. Thus slope is

`atan(sqrt(a²+b²) × k/(1+h/R)) × 180/π`.

Slope uses **3 × 3 pixels**: nominal 15 m pixel support, 10 m between outer centres. Roughness uses **5 × 5 pixels**: nominal 25 m square support, 20 m outer-centre span:

`roughness = sqrt(mean((h_i − a x_i − b y_i − c)²))`, metres RMS.

This removes local tilt; it is neither undetrended elevation standard deviation nor a boulder-height metric. OLS residuals are invariant under uniform rescaling of local X/Y. The roughness fit is to radial heights; lunar tangent curvature over 25 m contributes less than 0.0001 m and is negligible relative to output quantization/source error. No atmospheric or Earth-CRS assumptions are introduced.

`pipeline/hazard_site01.py` uses source halo pixels to support the crop boundary. Incomplete neighbourhoods and native raster edges become NaN, never zero-filled measurements. Scientific Float32 GeoTIFFs are written to ignored `pipeline/out/hazards/{slope,roughness}.tif`. Browser fields retain **1601 × 1601 samples at 5 m spacing**, while geometry remains 401 × 401 at 20 m. No measurements are inferred between mesh vertices for hazard computation.

For efficient browser transfer, values are encoded UInt16 little-endian at 0.001° / 0.001 m increments (rounding bound ±0.0005), with 65535 reserved for unavailable. Out-of-range encoding fails instead of saturating. Both layers total about 9.8 MiB; source/raw downloads remain ignored. The manifest records source hash, methods, supports, range, output hashes, independent checkpoints and official comparison metadata. The scientific classifier operates on these rounded values; threshold decisions within a quantization unit are not precision guarantees.

## Geospatial alignment and display

Analysis origin equals mesh's first vertex centre (X −11047.5 m, Y −8237.5 m); analysis last centre is X −3047.5 m, Y −16237.5 m. Source hash, origin and extent are checked before use. Mesh UV coordinates are mapped to first/last **analysis sample centres**, with half-texel offset and `(N−1)/N` repeat; nearest-neighbour texture sampling avoids averaging favorable/unfavorable classifications. Browser point values use the nearest native analysis centre, with a nominal maximum half-cell offset in each projected axis. Readout values therefore need not equal the mesh's interpolated slope, which is not used.

Texture generation changes only display colors/classification; it does not recompute scientific rasters. Precomputed metrics are loaded with length/georeferencing/checksum verification. Textures are recomputed only for layer/threshold/theme changes, not camera motion or pointer movement. Footprint iteration visits only its bounding box and accepts centres actually inside the disk. Circle radius is corrected using local horizontal scale at its centre; data-coverage percentages are sample-centre area estimates, not exact subpixel integration. Radius ≤2 km keeps this local approximation appropriate. The boundary is offset 3 m visually to prevent surface occlusion; that offset changes no scientific values. Partially outside footprints have unavailable sample centres in their denominator.

## Numerical validation

| Check | Result |
|---|---|
| Constant synthetic plane | Exactly zero valid-cell gradient |
| Known inclined plane (a=0.2, b=0.3) | Fitted gradients match within 1e-11; detrended RMS <1e-5 m |
| Known impulse residual surface | Centre RMS equals `sqrt(24)/25` m to 12 decimal places |
| NoData and raster edges | Missing support/edge outputs remain unavailable |
| Independent numpy `lstsq` vs processing kernels, five real source windows | Maximum mixed-unit numerical difference **9.69e-11** (degrees for slope or metres for RMS), below 1e-7 assertion |
| Derived slope vs official Site01 slope, entire crop | **0.505067° RMS**, **15.244853° maximum absolute difference**; different estimators/support cannot be assumed identical. This is a reported comparison, not an asserted equivalence or validation against ground truth. |
| Browser selected slope vs Float32 scientific GeoTIFF | **0.000473904°** difference, within ±0.0005 encoding bound |
| Browser selected roughness vs Float32 scientific GeoTIFF | **0.000314077 m** difference, within ±0.0005 encoding bound |
| Independent 100 m circular footprint count | **1260** centres; exact match to browser total and permissive-threshold meeting count |
| Footprint min/mean/max slope vs scientific raster | Maximum **0.000307854°** difference; mean difference 0.000004217° |
| Footprint min/mean/max RMS vs scientific raster | Maximum **0.000457718 m** difference; mean difference 0.000010136 m |
| Repeat processing | Identical slope/RMS binary hashes; processing reuses cached sources |

Evidence: [browser validation JSON](data/MILESTONE2_BROWSER_VALIDATION.json), [scientific manifest](../web/public/data/terrain/site01/hazards/hazards.json), [Python tests](../pipeline/test_hazard_site01.py), [frontend tests](../web/src/lib/hazardAnalysis.test.ts), [browser test](../tests/e2e/hazard_test.py). Synthetic surfaces are test-only; none are shipped as scientific measurements.

The original acceptance did not establish the stencil cause; the follow-up below now identifies estimator weighting as dominant, while the exact NASA implementation remains unconfirmed. We do not claim exact agreement. The independently validated, explicitly defined OLS estimator is the screening field.

## Checks and browser acceptance

- Baseline before development: 69 JS tests, 6 Python tests, lint, formatting, build and ten-flow smoke passed.
- After implementation: **73 JS tests (9 files), 11 Python tests with no skips**, lint, formatting and production build pass.
- Existing smoke suite: ten functional flows plus zero-console gate pass.
- Existing M1 terrain browser suite: passes, including source-coordinate verification, fonts, WAC default-off, planner integration and checksum recovery.
- New hazard suite: rendered pixel changes across layers, unchanged camera pose, threshold pass/fail/missing transitions, source-raster point and footprint-statistic comparison, radius changes, clipped coverage, unavailable-layer retry while terrain stays available, mobile overflow and planner navigation pass.
- Desktop/mobile science screenshots were captured and inspected under ignored `pipeline/out/hazards/`; software-renderer screenshot `ReadPixels` warnings and the existing Vite >500 kB lazy-chunk advisory remain non-scientific runtime/build limitations.

## Reproduce and view

```sh
cd /workspace/lunawindow
# Reuse existing terrain Python environment, or create pipeline/.venv.
python -m venv pipeline/.venv
pipeline/.venv/bin/pip install -r pipeline/requirements-terrain.txt
pipeline/.venv/bin/python pipeline/hazard_site01.py
pipeline/.venv/bin/python -m unittest discover -s pipeline -p 'test*.py' -v
cd web
npm ci
npm test
npm run lint
npm run format:check
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
# Another shell, from repo root, with Playwright installed and Chromium available:
python tests/e2e/smoke_test.py http://127.0.0.1:4173/
python tests/e2e/terrain_test.py http://127.0.0.1:4173/ --executable /usr/bin/chromium
python tests/e2e/hazard_test.py http://127.0.0.1:4173/
```

The new browser suite currently uses `/usr/bin/chromium`; change that documented executable when running on another OS. Scientific browser tests require the generated Float32 GeoTIFFs and native-source tests require the raw NASA inputs. These stay outside Git. App runtime needs only checked-in processed assets.

For manual testing: open the existing app with `npm run dev`, choose **3D Terrain**, select Site B / Connecting Ridge, then click the mesh or enter −89.53432°, 209.94767° E. Scroll to **Scientific terrain analysis**. Switch layers and observe the heatmap, change maximum slope/roughness and inspect the point reason. Change footprint radius and inspect its boundary and statistics. Enter a point near a crop corner to see incomplete coverage. Return to Explore & Compare, Finder or Surface View to confirm existing features remain present. Analysis controls are local workspace state, not new shared-URL mission parameters.

## Slope-discrepancy follow-up

The discrepancy is now investigated across all 2,563,201 crop samples. **Estimator/stencil weighting is the dominant cause**: a four-neighbour projected central gradient matches the official raster at 0.000272° RMS / 0.010948° maximum, versus OLS's 0.505067° / 15.244853°. Both use native 5 m data and the same nominal 3×3 extent; OLS averages diagonals/axial differences differently. No OLS implementation error was identified. Production scientific bytes remain unchanged.

NoData, resampling and one-cell misregistration do not explain the large errors. The physical-distance correction contributes at most 0.028454°. All >10° differences are interior. Error p50/p95/p99/p99.9: 0.141100° / 1.031814° / 1.955439° / 3.953996°. There are 1183 cells >5° (0.046153%) and 45 >10° (0.001756%). Worst location: −89.54892118°, 220.52292091° E; OLS 19.823724°, official 35.068577°.

At a 10° threshold, 48,632 slope-only decisions differ (1.897315%); with the same 0.3 m RMS condition, 42,410 combined decisions differ (1.654572%). The UI explicitly labels OLS and warns that it is not NASA's supplied slope raster. This preserves existing criteria semantics without implying equivalence. The near-matching central method is not proven to be NASA's exact implementation; 164 small residuals exceed final-file Float32 rounding bounds, and their exact source remains unconfirmed.

Full causal controls, percentile/frequency tables, top locations, spatial bins, threshold directions and remaining residuals: [slope investigation](SITE01_SLOPE_DISCREPANCY.md) and [JSON evidence](data/SITE01_SLOPE_DISCREPANCY.json). Re-run `python pipeline/investigate_site01_slope.py`. Follow-up verification: 73 JS / 14 Python tests, lint, formatting, build and all three browser suites pass. No remote work or Milestone 3.

## Scientific limits and optional future work

The DEM's ~90% interpolation, uncertain effective resolution and source RMS apply to every derived field. The displayed height RMS is not a confidence interval on slope/roughness; source errors may be spatially correlated and roughness may be comparable to elevation uncertainty. No independent physical calibration, uncertainty propagation or exact official-slope stencil reproduction is claimed. High-frequency surface obstacles below effective resolution, boulders/craters, bearing capacity, dynamics and other hazards remain unverified. The system screens selected terrain criteria, never certifies a landing safe.

Optional improvements: independent local roughness/laser-spot comparison at matched support, propagated covariance/slope uncertainty, calibrated official slope estimator, additional documented baselines, more sites and worker-based texture updates if needed. These are not claimed implemented. Milestone 3 has not begun.
