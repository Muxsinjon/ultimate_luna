# Milestone 1 final acceptance — 2026-11-14

**Accepted for local review with the explicit WAC registration limitation below.** No Milestone 2 work, remote GitHub changes, push, publication or merge was performed. All work remains on `feat/connecting-ridge-3d`.

## 1. LROC WAC registration: unverified, safely constrained

WMTS source geometry, lunar reference radius, target projection/extent, pixel-centre/edge convention and UV orientation pass the existing georeferencing checks. Those checks establish map placement, **not independent image-to-terrain registration accuracy**.

Review of this coarse, dark polar WAC crop did not establish a defensible independent landmark control set. Of its 1,048,576 pixels, 98.55% have intensity below 8/255 (95th-percentile intensity 5/255). The source metadata quotes 12–300 m absolute accuracy. No landmark residual, measured frame correction or subpixel co-registration accuracy is claimed.

Disposition required by the acceptance request:

- **Shaded elevation remains the default**, so WAC is disabled by default.
- Selector explicitly says **“LROC WAC — registration unverified”**.
- A warning remains visible even while shaded elevation is selected; optional texture is context only.
- Browser checks assert the default and warning, then explicitly opt in to test the real decoded texture.

Evidence: [registration review](data/SITE01_REGISTRATION_REVIEW.json), [source transforms and tile provenance](../web/public/data/terrain/site01/imagery-provenance.json), [viewer](../web/src/workspaces/TerrainExplorer.tsx), [browser acceptance](../tests/e2e/terrain_test.py). Independent landmark registration remains an acknowledged limitation, not a passed precision claim.

## 2. Google Fonts certificate issue: fixed without changing trust

Diagnosis: Chromium rejected the environment's proxy certificate on external Google Fonts requests, while the same source requests succeeded through system-CA-verified HTTPS. This affected the baseline application before Milestone 1. The previous full smoke suite therefore failed its console gate despite passing its ten functional flows.

Fix: self-host the same Barlow regular/medium/semibold and Barlow Semi Condensed semibold fonts. Unmodified Google Fonts binaries were downloaded with TLS verification enabled, checked for their family/style with Fontconfig, and bundled with both SIL OFL licenses, source URLs and SHA-256 hashes. The application no longer requests Google Fonts externally. No browser trust-store changes, certificate-error flags or TLS exceptions were used.

Evidence: [font sources, hashes and licenses](../web/public/fonts/SOURCES.md), [local font CSS](../web/public/fonts/fonts.css), [application HTML](../web/index.html). The unchanged full smoke test now passes **10 workflows, zero failures, no console errors or warnings**. The terrain browser test requires all four font faces to load and asserts **zero external HTTP(S) requests or failed requests**. A separate browser check served the production build under `/lunawindow/`, verified all four local weights and confirmed no external requests; this checks GitHub Pages-style relative asset paths without deploying anything.

## 3. Selected coordinates/elevations: verified against original GeoTIFF

An independent reference helper reads the **original 5 m GeoTIFF** through Rasterio, uses PyProj for geographic/projected conversion and derives interpolation expectations from native pixels. It does not use the exported binary to compute expected heights.

- **101 fractional-coordinate samples** (curated coordinate plus 100 deterministic samples) are checked against browser-library interpolation. Agreement with independent source-derived 20 m bilinear interpolation is within 1e-5 m. For these samples, the maximum 20 m bilinear difference from native 5 m bilinear interpolation is 0.7743 m; triangle interpolation's maximum is 0.9731 m. These sampled maxima are not global bounds.
- **Five distinct actual browser ray picks** are compared with the original source at their full-precision lunar coordinates. Maximum difference from native 5 m bilinear heights is **0.1865 m**; maximum numerical difference from independently derived 20 m triangle heights is **0.0000493 m**, below the explicit 0.01 m tolerance for projection/Float32/chord effects.
- Numeric entry at −89.53432°, 209.94767° E returns **1653.2388505 m**, agreeing with the independent 20 m bilinear expectation to better than 1e-5 m. Native 5 m bilinear height there is **1653.1738154 m** (difference 0.06504 m). The nearest native pixel's height, 1653.2899 m, is a different sampling method and is not mistaken for an interpolated height.
- Existing curved-coordinate round-trip tests cover metre-space/latitude/longitude/radial elevation, including Float32 vertex precision; out-of-coverage and NoData checks remain active.

Evidence: [independent helper](../pipeline/verify_site01_acceptance.py), [101-point reference](data/SITE01_SAMPLE_REFERENCE.json), [actual browser picks and numeric entry](data/SITE01_BROWSER_PICKS.json), [unit assertions](../web/src/lib/terrainMesh.test.ts). UI coordinate/elevation rounding is for display; acceptance reads the underlying full-precision selected values.

## 4. 20 m mesh derivation: exact native sample subset, no fabrication

The source SHA-256 is `3ba7b97cb00a2bcf21189c3aeb535f65afc21207154ab9f0d43c5bdc1f7e747e`. The complete **160,801-value 401 × 401 exported grid** passes exact array equality against every fourth native 5 m pixel in the original 1601 × 1601 crop. The uncertainty raster is independently hashed and checked. Six distributed geographic/elevation checkpoints match source values; projection round trips are below 1e-6 m.

No new elevations are fabricated, filled or upsampled. NASA's own source is already interpolated between laser returns (~90% of native pixels), and that is disclosed. Triangles interpolate between actual sampled vertices at runtime.

The previously measured global decimation comparison over 2,563,201 native samples remains **0.2526 m RMS, 0.5125 m p95 absolute, 8.1865 m maximum absolute residual**. These are errors relative to the native interpolated DEM, not ground-truth accuracy, and remain separate from NASA's RMS uncertainty.

Evidence: [processor](../pipeline/terrain_site01.py), [full native equality test](../pipeline/test_terrain_site01.py), [asset metadata and checksums](../web/public/data/terrain/site01/terrain.json). No production terrain bytes were changed during this final verification.

## 5. Complete checks

| Check | Final result |
|---|---|
| `npm test` | **69 passed**, 8 files |
| Python `unittest discover -s pipeline -p 'test*.py' -v` | **6 passed**, zero skips; native source present |
| `npm run lint` | Passed |
| `npm run format:check` | Passed |
| `npm run build` | Passed; existing >500 kB uncompressed lazy Three.js chunk advisory (~144 kB gzip) |
| Existing unchanged smoke suite | **10 workflows passed, 0 failed**, no console errors or warnings |
| Terrain browser suite | Passed camera rendering, picking/drag distinction, source comparisons, coordinates/RMS, default-off unverified texture, explicit texture opt-in, planner integration, coverage, mobile layout, checksum recovery, local fonts and no external requests |
| Existing screenshot script | All 10 desktop/mobile workspace captures completed; **no console errors or warnings** |
| Nested-path production font check | Passed under `/lunawindow/`; all four font faces load locally |

The terrain screenshot run reports four software-renderer `GPU stall due to ReadPixels` performance warnings. These result from screenshot capture, are explicitly counted, and are not hidden as application failures. All other console errors/warnings remain fatal in the terrain acceptance script. Screenshots are in ignored `pipeline/out/milestone1-final-screenshots/` and `pipeline/out/terrain-screenshots/`; representative final layouts were visually inspected.

## 6. Final scope and remaining limits

[PROJECT_STATUS.md](PROJECT_STATUS.md) reflects these final results. Milestone 1's real terrain explorer is accepted with the optional texture explicitly unverified and off by default. Remaining limits: no independently validated image/DEM landmark registration; WAC is not NAC precision imagery; 20 m mesh decimation has the measured residuals above; the planner retains its original 960 m regional DEM for 250 km horizons; inspection lighting and baked-in photographed shadows are not time-dependent physical shadow simulations. No Milestone 2 work is included.

Re-run using the commands in [TERRAIN_3D.md](TERRAIN_3D.md). Regenerate the independent reference with `python pipeline/verify_site01_acceptance.py` using the terrain Python environment. The browser source-comparison suite requires the original downloaded GeoTIFF plus Rasterio/PyProj, not just Playwright.
