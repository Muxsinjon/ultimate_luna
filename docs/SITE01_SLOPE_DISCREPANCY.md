# Site01 slope discrepancy investigation

Follow-up to Milestone 2, 2026-11-14. All 2,563,201 native 5 m crop centres were compared; no production scientific asset was changed. Full reproducible results, top 20 locations, native 3×3 height patches and all 64 spatial-bin counts: [JSON evidence](data/SITE01_SLOPE_DISCREPANCY.json). Run `python pipeline/investigate_site01_slope.py` in the terrain Python environment; inputs are the same pinned NASA GeoTIFFs used by Milestone 2.

## Finding and disposition

**The dominant discrepancy is the slope estimator's weighting/stencil, not incorrect georeferencing, resampling, edges or NoData.** The production OLS implementation independently reproduces a least-squares plane; no numerical implementation error in that estimator was identified. Its scientific definition is retained, rather than silently changing existing classifications to another estimator. UI selector/readout/legend now explicitly identify OLS, and a persistent notice states it is not NASA's supplied slope raster and that estimator choice changes threshold classifications.

A four-axial-neighbour central gradient on projected 5 m distances nearly reproduces the NASA raster. This is an empirical reconstruction, **not confirmation of NASA's exact implementation**. Both the central and OLS3 calculations fit in the same nominal 3×3 extent; their different weighting of diagonal/axial samples, not merely a different bounding-window size, explains the large differences at nonlinear local height patterns. Such patterns can be physical terrain or source interpolation/artifacts; this investigation does not distinguish those origins.

For pixel spacing d=5 m, central x gradient is `(h[E]−h[W])/(2d)`. OLS3 x gradient averages the three row-wise east/west differences, dividing their sum by `6d`. North gradient is analogous. Thus a sharp axial change can be substantially reduced by the fitted plane's use of diagonals. Production OLS uses `atan(hypot(a,b) × k/(1+h/R))` in degrees, with the documented local projection/elevation correction. The near-reconstruction of NASA uses `atan(hypot(a,b))` on projected distances.

## Controlled method comparisons

| Estimator | RMS vs NASA (°) | Maximum absolute (°) |
|---|---:|---:|
| Production 3×3 OLS, physical distances | 0.505067466 | 15.244852728 |
| 3×3 OLS, projected distances | 0.504194278 | 15.227779918 |
| Four-neighbour central, projected | 0.000271938 | 0.010947519 |
| Four-neighbour central, physical | 0.009441566 | 0.029668194 |
| Horn weighted 3×3, projected | 0.379677588 | 11.366135466 |
| 5×5 OLS, physical | 1.039681556 | 23.699593712 |
| 7×7 OLS, physical | 1.348087236 | 30.217590177 |

The production distance correction alone changes slopes by 0.009405° RMS / 0.028454° maximum, far too small to explain the 15.245° discrepancy. It is intentional conversion to local physical horizontal distances, not a bug to remove simply to mimic another product. Increasing OLS support to 5×5/7×7 worsens agreement, consistent with additional smoothing.

The GeoTIFF dimensions, CRS, affine transforms, pixel centres, scale/offset and source hashes match. Native integer windows are used without resampling; the 20 m mesh and output quantization are not involved in the full-precision discrepancy comparison. Both input crop rasters and the complete source halo are finite. The crop is at least nine source pixels from the native boundary. Three-pixel crop-rim RMS is 0.478743°, interior RMS 0.505261°; all 45 differences >10° are interior. Introducing a one-pixel offset in any direction worsens central-gradient RMS from 0.000272° to 1.3756–1.4224°, rejecting a one-cell registration explanation.

## Error distribution and frequency

Absolute OLS-minus-NASA differences (degrees); signed mean is −0.045177°, so differences are not uniformly underestimates.

| Percentile | Absolute difference (°) |
|---|---:|
| 50 | 0.141100 |
| 90 | 0.700362 |
| 95 | 1.031814 |
| 99 | 1.955439 |
| 99.9 | 3.953996 |
| 99.99 | 7.370555 |

| Strict absolute exceedance | Cells | Percent of crop |
|---|---:|---:|
| >0.5° | 413,030 | 16.113836% |
| >1° | 136,489 | 5.324943% |
| >2° | 23,994 | 0.936095% |
| >5° | 1,183 | 0.046153% |
| >10° | 45 | 0.001756% |

## Where large differences occur

Coordinates use the same lunar sphere/frame and east-positive longitude as Site01. Source indices are zero-based original GeoTIFF indices. These are raster sample locations, not claims of identified craters or obstacles.

| Source row, column | Latitude | Longitude E | OLS ° | NASA ° | OLS−NASA ° |
|---|---:|---:|---:|---:|---:|
| 1279, 2022 | -89.54892118 | 220.52292091 | 19.823724 | 35.068577 | -15.244853 |
| 1375, 2876 | -89.61030207 | 203.00122820 | 7.895336 | 21.827858 | -13.932522 |
| 1315, 2703 | -89.60710589 | 207.39848332 | 9.960784 | 23.752699 | -13.791915 |
| 1320, 2975 | -89.62485268 | 201.24724566 | 18.568080 | 32.047588 | -13.479508 |
| 1667, 2609 | -89.54825806 | 205.75601428 | 3.098307 | 16.466246 | -13.367938 |

The worst cell projects to X −8887.5 m, Y −10397.5 m and is 432 pixels inside the display crop. An independent `numpy.linalg.lstsq` fit to its actual source 3×3 heights reproduces 19.823724°; a manual four-neighbour difference gives 35.068363°, versus NASA 35.068577°. This directly demonstrates stencil sensitivity at the worst location. Its 25 m roughness is 1.207 m: with the default 0.3 m RMS criterion, both methods already fail roughness. Its slope difference changes a 20° slope decision, but would change the combined decision only if the roughness criterion also passed.

Spatial counts use 1 km projected bins, indexed from the crop's north-west sample. The largest >5° count is bin row 2/column 6 (54 of 40,000 centres), followed by row 2/column 1 (52), row 0/column 5 (51), and row 3/column 5 (40). Differences are distributed across the crop, not a single seam or boundary. JSON includes every bin and all 20 largest discrepancies.

## Effect on configurable criteria

This comparison replaces only the slope decision with NASA's value, holding roughness at the same app-derived 25 m metric. It is **not a comparison of safety truth**. App values include the actual 0.001° rounding used in the UI. All samples are valid; percentages use the entire crop denominator.

| Maximum slope | Slope-only flips | Percent | App meets/NASA exceeds | App exceeds/NASA meets | Combined flips at RMS ≤0.3 m | Combined percent |
|---|---:|---:|---:|---:|---:|---:|
| 2° | 11,218 | 0.437656% | 5,571 | 5,647 | 10,078 | 0.393180% |
| 5° | 31,062 | 1.211844% | 15,570 | 15,492 | 27,886 | 1.087937% |
| 10° | 48,632 | 1.897315% | 27,098 | 21,534 | 42,410 | 1.654572% |
| 15° | 36,224 | 1.413233% | 22,107 | 14,117 | 28,476 | 1.110955% |
| 20° | 20,332 | 0.793227% | 13,372 | 6,960 | 14,046 | 0.547987% |
| 30° | 672 | 0.026217% | 564 | 108 | 23 | 0.000897% |

At the illustrative 10° / 0.3 m defaults, 42,410 combined decisions differ (1.654572% of all centres). Disagreements also occur where slope differences are modest but close to a chosen threshold; rare large discrepancies alone do not characterize classification sensitivity. Footprint percentages/maximum slopes can consequently differ by estimator. The app remains an OLS-based preliminary screening system and does not claim to apply NASA's official slope classifications.

## Remaining central-gradient residual

Central projected reconstruction has p95 0.000522°, p99 0.000638°, p99.9 0.000765°, maximum 0.010948°. Conservative bounds from rounding native Float32 heights and the output slope contain 99.993602% of residuals, but **164 cells exceed those bounds**. All 164 have official slopes between 0 and 1.01645°, including two encoded zeros. The maximum is at −89.35725038°, 214.47483629° E, source row 2413/column 1593: NASA 0°, central reconstruction 0.0109475°.

Final-file Float32 rounding alone therefore does not fully explain the remaining residual. Low-angle numerical treatment and earlier source processing are possibilities, not established causes. No original NASA code/stencil confirmation or independent ground truth was obtained, and exact reproduction is not claimed. These small residuals do not explain the much larger OLS discrepancy.

## Verification

73 JavaScript tests, 14 Python tests (including three new discrepancy guards), lint, formatting and production build pass. Existing smoke, Milestone 1 terrain and Milestone 2 hazard browser suites pass; the new UI notice is asserted in-browser. Manual worst-cell formulas, raw source values/hash/georeferencing, error frequencies, directional criterion counts and coordinate/shift controls have regression assertions. Existing software-renderer screenshot warnings and Vite lazy-chunk advisory remain. No production science bytes, original features, source rasters or remote repositories were changed.
