# Milestone 8: optional environmental science overlays

Date: 2026-11-15. Branch `milestone-8`, based on Milestone 7 (`cd5afab`).

This milestone is optional; nothing in the core workflow depends on it. All existing terrain, comparison, finder, visibility and immersive-view suites still pass.

## Source feasibility audit

Each catalogue was contacted over verified HTTPS on 2026-11-15. TLS was never bypassed.

| Candidate | What is actually available | Decision |
|---|---|---|
| **Diviner Polar Resource Products** (PDS Geosciences, `LRO-L-DLRE-5-PRP-V2.0`, `dlre_prp_south.tab`) | ASCII table, 604,800,210 bytes, 2,880,000 triangles on a Kaguya-derived polar DEM (about 0.5 km facets, 1737.4 km sphere, planetocentric, east-positive). Columns (from the PDS4 label): annual average temperature at 2 cm depth (K), annual maximum surface temperature (K), and depth at which water ice would sublimate at < 1 kg m⁻² per Gyr (m; 0 = stable at the surface, −999 = deeper than 2.8738 m). **Model-derived** (thermal-model fits to the first mapping year). Citation: Paige et al. (2010), Science 330; Paige et al., PDS (2018). | **Integrated** at all three 5 m sites |
| **ShadowCam controlled mosaic** `shackleton01` (pds.shadowcam.im-ldi.com, `derived/cmosaic`) | 20 m cloud-optimised GeoTIFF (4.3 MB), south polar stereographic, R = 1737.4 km. Observed I/F (0.02–0.81) of the permanently shadowed Shackleton interior. Also 5 m, ISIS cube and other crater mosaics. | **Integrated** at Site04 (66 % of the crop). Site01's overlap is 0.7 %, below the 2 % minimum, so it is not offered. Site06 has none. |
| UCLA Diviner Level 4 polar rasters (`luna1.diviner.ucla.edu`) | Redirects to HTTPS with a certificate that fails verification | **Rejected:** TLS is not bypassed. The PDS copy above was used instead. |
| ShadowCam DTMs / other crater mosaics (`derived/dtm`, `umosaic`) | DTMs for Shackleton, Nobile and Sverdrup regions; hundreds of uncontrolled mosaics | **Deferred:** a second elevation source would need its own registration study against LOLA |
| LEND (PDS Geosciences `lend.htm`) | Neutron count products. The collimated sensor footprint is about 10 km, larger than our 8 km crops. | **Deferred:** a single value per crop at best. Indirect hydrogen evidence, not ice. |
| Mini-RF (PDS Geosciences `mrf.htm`) | Polar mosaics (map-projected, level 3) and bistatic data in PDS3, being migrated to PDS4 | **Deferred:** circular polarisation ratio is ambiguous between roughness and ice, and needs careful interpretation and product selection |
| M3 (PDS Imaging `m3.html`) | Spectral cubes and mosaics. Near the pole, illumination is poor and coverage sparse at about 140 m. | **Rejected for these sites:** too little usable signal in the crops |
| CRaTER (PDS PPI) | Spacecraft-based LET spectra and dose time series in orbit | **Rejected as a surface layer:** cannot be converted into a surface or astronaut dose map without a validated transport model |

The full catalogue directory remains in [DATA_SOURCES.md](DATA_SOURCES.md).

## Reusable overlay framework

**Pipeline** (`pipeline/science_layers.py`). For each processed site it writes `terrain/<site>/science/index.json` plus one Uint16 LE file per layer. Each layer is sampled on the site's own mesh vertices: every 4th vertex (80 m) for Diviner, every vertex (20 m) for ShadowCam. Each layer record holds:
- kind (`model` or `observation`), quantity, unit, scale and offset;
- `noData`, and coded `specials` that are states, not values;
- coverage %, resolution, period, legend, source (URL, label, citation, hash) and caveats.

**Sampling:**
- **Diviner:** each vertex takes the value of the triangle that contains it, found by a barycentric test on the eight nearest triangle centres.
- **ShadowCam:** each vertex takes the 20 m source pixel that contains it.

**Provenance:**
- The 605 MB Diviner table is streamed once over HTTPS, every byte hashed (SHA-256 `393deaa5…`), and only rows south of 84.9° S kept: 586,132 rows in `pipeline/out`, gitignored.
- The ShadowCam window bytes are hashed and cached for offline tests.

**Undocumented source code:** `ice_depth = −1.0` occurs in 52,098 facets, all very cold (maximum temperature ≤ 101 K), but the PDS label does not define it. It is kept as a separate coded state, "Source code −1 (not defined in the PDS label; not interpreted)". It is never displayed as a depth or merged with "stable at the surface".

**UI** (3D Terrain, single-site view → "Science layers (optional context)"):
- a layer toggle and opacity slider;
- a "Model-derived" or "Observation" badge;
- a gradient legend with units;
- coverage, resolution and period;
- a point readout ("No data" or the coded state, never a guess);
- caveats, plus the source link and citation.

A science layer temporarily takes the overlay slot; "Off" restores the lighting or hazard overlay.

**No combined score:** nothing is merged into a safety score. The cross-site comparison was **not** extended. The default 100 m footprint is smaller than the 0.5 km Diviner facets, so footprint statistics would imply a precision the data lack.

**Asset sizes:** 72 KB per site for Diviner, plus 316 KB for ShadowCam at Site04.

## Validation (independent of the browser code)

| Check | Result |
|---|---|
| Diviner source integrity | 2,880,000 rows; byte count equals the PDS listing; layer files match their manifest hashes |
| Diviner values vs a brute-force containing-triangle search on the raw rows (60 vertices × 3 sites) | Equal within quantisation (≤ 0.005 K) |
| Ranges and units | Average temperature 46–188 K and maximum 64–341 K across the crops. Ice depth 0–1.29 m where defined. Coded-state percentages equal the manifest. |
| **Placement cross-check with an independent NASA product** | At Shackleton, Diviner's model maximum temperature has a median of **87.6 K inside** PGDA's 20 m permanent-shadow map and **279.5 K outside** it, so the two products line up |
| ShadowCam values vs source pixels (400 random vertices) | Equal within quantisation (2e-5 I/F); no-data kept as no data, never filled |
| ShadowCam vs PSR | Covers 98 % of the mapped permanent shadow in the Site04 crop; 55 % of its valid pixels are PSR |
| Browser (`tests/e2e/science_test.py`) | Readout at the Shackleton site 319.6 K vs 319.61 K decoded independently from the file. Nobile Rim 1 average temperature readout equals the file (107.4 K). Model/observation badges, legend, opacity, switching (no stale metadata), "Off" path, ShadowCam offered only where observed, clean console. |

## Fix found during regression

The astronomy e2e failed intermittently, and consistently once Milestone 8 made the terrain screen heavier. The cause was a real race in `App.tsx`:
1. An edited or pasted link arrived just after an in-app action.
2. A pending state commit called `replaceState` with the old hash.
3. The `hashchange` handler then read the overwritten `location.hash`.

The handler now reads `HashChangeEvent.newURL`. The astronomy suite passed 3 of 3 afterwards (it had failed 2 of 2 before). This also explains the "transient" astronomy timeouts noted in Milestones 6 and 7.

## Tests

| Suite | Result |
|---|---|
| Unit tests (`npm test`) | 127 passed, including `scienceLayers.test.ts` (decoding, coded states, stride lookup, legend, alignment validation) |
| Python | 34 passed, including `test_science_layers.py` (6 tests) |
| E2e: smoke, terrain, hazard, terrain compare, astronomy, lighting, finder, surface 3D, science | All pass |
| `tsc`, ESLint, Prettier, build | 0 errors |

The terrain compare e2e's intermittent cancelled download (noted in Milestone 7) did not recur.

## Interpretation caveats (shown in the UI)

- **Diviner layers:**
  - They are model output fitted to 2009–2010 observations, not direct measurements or forecasts for a date.
  - Ice depth indicates where ice would be thermally stable; it is not evidence that ice is present.
  - Facets are about 0.5 km on a Kaguya DEM, and registration to LOLA is not independently verified (the PSR agreement above is supporting evidence).
- **ShadowCam:**
  - It shows light scattered into permanent shadow, which is not albedo.
  - Sunlit pixels may be saturated or sparse.
  - It covers only part of one crop, and no imagery is substituted where none exists.
- **Not integrated:** LEND, Mini-RF, M3 and CRaTER, for the reasons above.

## Reproduce

```bash
cd pipeline
.venv/Scripts/python science_layers.py        # streams the Diviner table (~605 MB, hashed) and the ShadowCam COG window
.venv/Scripts/python -m unittest test_science_layers
cd ../web && npm test && npm run build && npx vite preview --port 4173
python tests/e2e/science_test.py http://localhost:4173/   # from repo root
```
