# Milestone 3: multi-site 3D terrain and comparison

Date: 2026-11-15. Branch `milestone-3`, based on `new_luna/main` at `0eabd44` (Milestones 1 and 2).

## What was already present and what is new

| Area | Already present (M1/M2) | Added in M3 |
|---|---|---|
| Terrain data | Site01 (Connecting Ridge) 5 m DEM to a 20 m mesh, slope and roughness layers | Site04 (Shackleton Rim) and Site06 (Nobile Rim 1) built with the same pipeline, plus `terrain/index.json` |
| Pipeline | `terrain_site01.py`, `hazard_site01.py` (Site01 only) | `pipeline/terrain_sites.py`: one generalised build for any PGDA product 78 site, reusing `fetch`, `inspect` and `plane_metrics` unchanged |
| Planner catalogue | 17 sites | 2 new entries (`shackleton-rim-site04`, `nobile-rim-1-site06`) at the DEM centre pixels; the other 17 entries are byte-identical after regeneration |
| UI | Single-site 3D view with hazard panel | "Compare A and B" mode: two 3D views, linked cameras, shared criteria, equal-footprint table, trade-off text, terrain-site selectors, navigation to charts, mission windows and Surface View |
| Tests | 73 JS, 14 Python, terrain, hazard and smoke e2e | 81 JS, 19 Python, new `tests/e2e/terrain_compare_test.py` |

## Sources (verified against the NASA catalogue)

NASA GSFC PGDA product 78, Barker et al. (2021), "Improved LOLA elevation maps for south pole landing sites". The README names Site04 "Shackleton rim" and Site06 "Nobile rim 1".

| Site | Files used | SHA-256 (surf) | Grid |
|---|---|---|---|
| Site04 | `Site04_final_adj_5mpp_{surf,toterr,slp}.tif` | `38ff70db…ce758` (pinned) | 3200², X −9000..7000 m, Y −15000..1000 m |
| Site06 | `Site06_final_adj_5mpp_{surf,toterr,slp}.tif` | `cca17e80…b03d` (pinned) | 4000², X 74000..94000 m, Y 100000..120000 m |

The full toterr and slp hashes are recorded in each `terrain.json` and `hazards.json`.

All files are south polar stereographic (sphere R = 1737.4 km, lat₀ −90°, lon₀ 0°), pixel-registered, 5 m, with NaN NoData. The frame is MOON_ME/DE421, matching Site01.

Catalogue discrepancy: Site06 is described in the README but missing from the PGDA HTML file index. It is served at the documented path (`image/tiff`), and was verified by opening it as a GeoTIFF and checking CRS, transform and metadata. This is recorded rather than hidden. Raw downloads stay in `pipeline/raw/` (gitignored).

**Crop centres.** No landing coordinate is published for Site04 or Site06. Each crop is centred on the DEM's own centre pixel (`centreSource` in the metadata), so no coordinate is invented. Site01 keeps its curated workshop coordinate.

## Method (identical for every site)

- **Mesh:** 8 × 8 km crop, 1601² native samples, decimated every 4th sample to a 401² mesh at 20 m. A 2-pixel source halo makes every edge neighbourhood complete.
- **Slope:** 3 × 3 OLS fitted plane (15 m support). **Roughness:** 5 × 5 detrended RMS (25 m support).
- **Encoding:** u16 with a quantum of 0.001 and NoData 65535.
- **Footprint:** sample-centre inclusion, with radius × stereographic scale ÷ (1 + h/R).
- **Screening:** a footprint passes when the share of valid samples meeting both criteria is at least the user's required share. Any unavailable sample makes the footprint "Insufficient data", never favourable.
- **NASA slope raster:** used only as a cross-check in `officialComparison`. It never enters the score. Site04 differs from it by 0.646° RMS, Site06 by 0.472° RMS. The independent least-squares points agree within 3e-9°.

**Equivalence proof.** `python terrain_sites.py --check-site01` rebuilds Site01 with the generalised code. Elevation, uncertainty, slope and roughness come out byte-identical, along with georeferencing and residuals (`allIdentical: true`, also a unit test).

| Site | Elevation range (crop) | Median height RMS | Mesh decimation residual (RMS / p95 / max) |
|---|---|---|---|
| Site04 | −1732.0 to 1737.9 m | 0.41 m | 0.382 / 0.781 / 19.13 m |
| Site06 | 3839.6 to 6770.2 m | 0.61 m | 0.263 / 0.504 / 14.57 m |

Planner horizons for the new sites use the existing 240 m regional DEM. Its site elevation (Site04 849 m, Site06 5967 m) differs from the 5 m DEM (768.0 m and 5946.4 m) because the supports differ. The terrain view always reports the 5 m value.

## UI behaviour

- **Site selection.** Site A and Site B terrain selectors write the planner site ids into the URL state. The existing site/date comparison, finder and Surface View therefore receive the same sites. Any planner or custom site inside a crop maps to that crop (`terrainSiteFor`). Sites outside every crop show "No processed 5 m terrain…" and are marked insufficient data.
- **Two 3D views.** Both support zoom, pan, rotate and picking, with overlays for elevation, slope, roughness and hazard. Picking moves that view's footprint centre.
- **Linked cameras.** The views share the camera offset in metres, giving the same physical scale and orientation (X east, Y up, Z south). The UI says this does not imply the sites are adjacent. Unlinking makes the views independent.
- **Comparison table.** For each site: screening result, product, footprint centre, radius and area, valid / selected samples and coverage, valid sample area, elevation range, slope min / median / P90 / max, slope distribution, roughness summary, share meeting both criteria and median height RMS. A method and limitations note follows the table.
- **Trade-offs.** The text is generated only from computed numbers. It states when neither site meets the criteria. It ranks by a transparent share-meeting-criteria score and says the result is not a landing-safety assessment.
- **No stale values.** Each pane is remounted per site (`key`), and table rows are accepted only when their `siteId` matches the current selection.
- **Performance.** Verified layers are cached per session (`terrainCache.ts`), so remounts and navigation do not re-download. Under the software renderer, both views loaded in 3.4–3.7 s.
- **Responsive layout.** Panes stack below 900 px, with no horizontal overflow at 390 px.

## Result at the default criteria (100 m radius, 10°, 0.3 m, 90 % required)

Both DEM-centre footprints **fail**, and the UI says so. Site04 has 0.0 % of 1246 samples meeting both criteria (median slope 32.2°: the centre lies on the crater wall). Site06 has 0.8 % of 1245 (median slope 15.3°). This is a property of the arbitrary DEM centres, not of the candidate regions. Users can pick a flatter point in each view to move the footprint.

## Validation

| Check | Result |
|---|---|
| `npm test` | 81 passed (new: `terrainCompare.test.ts` ×5, terrain lookup / asset parity ×3) |
| Python `unittest` (terrain venv) | 19 passed, no skips. New `test_terrain_sites.py`: hashes, identical parameters, heights, NoData, crop centres, footprint-centre rule, Site01 byte equivalence |
| `npm run lint`, `tsc`, `npm run build` | 0 errors |
| `tests/e2e/terrain_compare_test.py` | PASS. Table counts match an independent numpy count on the shipped layers (±2 samples); linked and unlinked cameras; shared thresholds; insufficient data; no stale values; navigation keeps `a`/`b`; mobile; no console errors |
| `terrain_test.py`, `hazard_test.py`, `smoke_test.py` | PASS (legacy workflows unchanged) |

Two test-harness fixes:

- `terrain_test.py` now waits for the analysis panel before its final reload. Previously the reload could cancel the 10 MB layer download, a race in the test.
- `hazard_test.py` no longer hard-codes `/usr/bin/chromium`. It uses `$CHROMIUM` or Playwright's bundled browser.

## Reproduce

```bash
cd pipeline
.venv/Scripts/python terrain_sites.py site04 site06   # downloads (hash-pinned) and builds
.venv/Scripts/python terrain_sites.py --index
.venv/Scripts/python terrain_sites.py --check-site01
.venv/Scripts/python horizon_mask.py                   # planner catalogue incl. the two new sites
.venv/Scripts/python -m unittest test_terrain_sites test_terrain_site01 test_hazard_site01 test_slope_discrepancy
cd ../web && npm test && npm run lint && npm run build && npx vite preview --port 4173
python tests/e2e/terrain_compare_test.py http://localhost:4173/   # from repo root, with numpy and Playwright
```

The recovery patch is `milestones/MILESTONE_3.patch`. It was made with `git format-patch --binary 0eabd44..<M3 commit>`, includes the terrain layers, and applies with `git am` onto `0eabd44`.

## Limits

- The source DEMs are about 90 % interpolated, and sub-grid boulders and craters are not resolved.
- Thresholds are illustrative. There are no confidence intervals and no safety certification.
- Linked cameras compare shape at equal scale; they do not geolocate one site relative to the other.
- Analysis settings are not stored in the URL; sites and dates are.
