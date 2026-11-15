# Site01 3D terrain explorer

The **3D Terrain** workspace is a separate Three.js view of real NASA LOLA topography. It shares Site A/B and URL state with the existing planner. It preserves the mission finder, comparisons, ephemeris, regional horizons and 360° Surface View. All changes are on a local development branch; no push, GitHub pull request, merge or deployment is authorized yet.

## Verified elevation source

NASA Goddard Planetary Geodesy Data Archive (PGDA), [High-Resolution LOLA Topography for Lunar South Pole Sites](https://pgda.gsfc.nasa.gov/products/78), Barker et al. (2021), *Planetary and Space Science* 203, 105119, [doi:10.1016/j.pss.2020.105119](https://doi.org/10.1016/j.pss.2020.105119).

Downloaded over TLS-verified NASA HTTPS on 2026-11-14:

- [Site01_final_adj_5mpp_surf.tif](https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif): 40,980,810 bytes; observed SHA-256 `3ba7b97cb00a2bcf21189c3aeb535f65afc21207154ab9f0d43c5bdc1f7e747e`.
- [Site01_final_adj_5mpp_toterr.tif](https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_toterr.tif): corresponding total surface-height RMS uncertainty; observed SHA-256 `cf2cf52f52d2aa51e60d058010d10b0ebfb1d3e920f5a2b9a46eb6c51054ab1c`.
- [NASA source README](https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README), preserved in [data/SITE01_README.txt](data/SITE01_README.txt).

The elevation request returned **HTTP 200**, `Content-Type: image/tiff`, `Content-Length: 40980810`, and `Last-Modified: Fri, 05 Jun 2020 18:39:35 GMT`. Rasterio/GDAL opened the response as a real GeoTIFF; MIME type alone was not accepted as validation. These are recorded hashes of authoritative HTTPS downloads, not publisher-issued checksums. The processor pins them and rejects changed source bytes for investigation.

### Source metadata

| Property | Verified value |
|---|---|
| Raster | 3200 × 3200, one Float32 band |
| Pixel size | 5 × 5 m |
| Projection | South-polar stereographic; pole −90°, central meridian 0°, false easting/northing 0 |
| Reference sphere | 1,737,400 m radius; spherical flattening 0 |
| Frame | MOON_ME, ephemeris DE421, from NASA product documentation |
| Bounds | X −19,000 to −3,000 m; Y −20,000 to −4,000 m |
| GeoTIFF transform | `[5, 0, -19000, 0, -5, -4000]` |
| First sample centre | X −18,997.5 m, Y −4,002.5 m |
| Registration | Pixel registered, `AREA_OR_POINT=Area`; GMT `node_offset=1` |
| NoData | IEEE NaN; none encountered in either downloaded full raster |
| Scale/offset | 1 / 0 |
| Vertical quantity | Surface height Z in metres, per NASA README; browser uses the declared 1737.4 km lunar reference sphere |
| Band unit tag | Unset; metre units were verified in the authoritative README, not inferred from the filename |
| Full elevation range | −523.1834 to 1959.4962 m |
| Full RMS error range | 0.06158 to 5.58282 m; median 0.37195 m |

The source WKT has unnamed datum labels. The processor checks radii, metre units, and forward projection at five geographic checkpoints against the canonical lunar projection; it does not force Earth EPSG codes or rely only on CRS label equality. Full WKT, tags, inspection metadata, source hashes and alignment checkpoints are in [terrain.json](../web/public/data/terrain/site01/terrain.json).

NASA reports roughly **90% of native 5 m pixels are interpolated** because of laser track/spot spacing. The product page describes median RMS height errors of about 0.30–0.50 m within its regions of interest. The quoted track geolocation uncertainties (10–20 cm horizontal, 2–4 cm vertical) must not be presented as the DEM's total error. This viewer samples the actual `toterr` raster instead.

## Browser asset and coordinate verification

An 8 × 8 km subset surrounds the existing curated Connecting Ridge coordinate, **89.53432° S, 209.94767° E** (Artemis III workshop 2023 abstract #2036, already cited in the site catalog). It is within the actual source coverage.

- Vertex grid: 401 × 401, 20 m spacing, sampled at every fourth native 5 m pixel centre. No fabricated heights, upsampling or new gap filling.
- First vertex: X −11,047.5 m, Y −8,237.5 m. Last: X −3,047.5 m, Y −16,237.5 m.
- Curated coordinate projects to X −7,049.355538 m, Y −12,235.636340 m. Its native source pixel is row 1647, column 2390; source elevation about 1653.2899 m. The 20 m interpolated readout is about 1653.2 m.
- Elevation and RMS assets are Float32 little-endian, 643,204 bytes each. The mesh has 160,801 vertices and 320,000 triangles before any NoData exclusion. The entire shipped terrain directory is about 1.37 MB.
- Six spatially distributed checkpoints (corners and interior) match independently sampled native source values. The full 401 × 401 grid is tested for exact equality to the native subset. Projection round-trip residuals are below 1e-6 m.
- Mesh vertices lie on the curved Moon before conversion to a local tangent frame (X east, Y up, Z south). Horizontal and vertical scale are both 1×. Picking ray-intersects real triangles and converts back to latitude, longitude 0–360° east, and radial elevation. Metre-space round trips and Float32 rendering precision are tested.
- NoData vertices never form valid triangles; coordinate queries outside the mesh are rejected rather than clamped or extrapolated.

Decimation adds error relative to the native DEM. Across 2,563,201 native samples in this crop, planar triangle interpolation has **0.2526 m RMS residual**, 0.5125 m 95th-percentile absolute residual, and **8.1865 m maximum absolute residual**. These are comparisons with the native interpolated DEM, not independent ground truth. They are distinct from source RMS uncertainty and image registration error. No landing-safety or precise local-slope certification is made.

## Real LROC imagery

The texture is **off by default and explicitly labeled registration unverified**. Map-coordinate reprojection checks do not establish independent image/DEM registration accuracy. See [final acceptance](MILESTONE1_ACCEPTANCE.md).

The optional texture uses NASA Moon Trek's **LRO_WAC_Mosaic_Global_303ppd_v02**, a real preliminary LROC WAC global mosaic assembled from over 15,000 images acquired November 2009–February 2011. It is coarser context imagery, **not NAC**. The polar subset is dark; shaded elevation remains the default.

- [Official WMTS capabilities](https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/WMTSCapabilities.xml)
- [Official layer metadata](https://trek.nasa.gov/moon/TrekWS/rest/cat/metadata/stream?label=LRO_WAC_Mosaic_Global_303ppd_v02)
- [Official description](https://trek.nasa.gov/moon/TrekWS/rest/cat/abstract?label=LRO_WAC_Mosaic_Global_303ppd_v02)

The pipeline verifies the WMTS geographic tile matrix, top-left corner and metadata reference radius/units, fetches 126 cached zoom-8 JPEG tiles with four download workers, and uses GDAL/Rasterio to reproject their geographic mosaic into the exact lunar stereographic mesh extent. The 1024 × 1024 texture's **edges coincide with outer vertex centres**; UV north/south and east/west orientation are tested. Output image pixel size (~7.8 m) does not create detail beyond the ~100 m nominal source resolution.

Every tile URL and SHA-256, capabilities hash, metadata hash, source and target transforms and texture bounds are recorded in [imagery-provenance.json](../web/public/data/terrain/site01/imagery-provenance.json). Browser loading checks elevation, uncertainty and texture hashes before use.

This establishes geographic map projection alignment, **not independent landmark co-registration**. WAC metadata quotes 12–300 m absolute accuracy; no new image/DEM landmark residual or MOON_ME frame correction was measured. Do not use this texture for metre-scale navigation. Its photographed shadows are baked into the mosaic and do not represent the selected mission time. Inspection lighting also remains independent of astronomical calculations.

## Reproduce processing and tests

Use the existing isolated checkout; do not create a new Git worktree for normal cloud development. Raw sources/tiles go into ignored `pipeline/raw/Site01/`; generated assets are tracked. No credentials are required. Network hosts: `pgda.gsfc.nasa.gov`, `trek.nasa.gov`, and the normal npm/Python registries.

```sh
cd /workspace/lunawindow
python -m venv pipeline/.venv
pipeline/.venv/bin/pip install -r pipeline/requirements-terrain.txt
pipeline/.venv/bin/python pipeline/terrain_site01.py --imagery
pipeline/.venv/bin/python -m unittest discover -s pipeline -p 'test_terrain_site01.py' -v
cd web
npm ci --cache /workspace/.cache/npm
npm test
npm run lint
npm run format:check
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
# Another shell, from the repository root:
python tests/e2e/smoke_test.py http://127.0.0.1:4173/
python tests/e2e/terrain_test.py http://127.0.0.1:4173/ --executable /usr/bin/chromium
```

Use a Python with Playwright installed for browser tests, and either the managed Chromium or the explicit system executable. TLS checks stay enabled using the system CA bundle. HTTP failures are not retried repeatedly. Cached inputs are reused; repeated processing produced identical elevation, uncertainty and JPEG hashes. Running without `--imagery` generates only elevation/uncertainty and intentionally omits the optional texture from the manifest.

The Python tests explicitly skip the full-native-source comparison if raw files have not been downloaded; asset hashes, coordinate checkpoints and texture bounds still run. All six Python tests, including the independent fractional reference test, executed with no skips in final verification.

The 3D browser test checks rendered pixel changes after camera operations, pointer picking versus dragging, coordinate and RMS readouts, the actual decoded LROC texture, Site A/B planner integration, coverage limits, mobile overflow and checksum-failure/retry recovery. Screenshots go to ignored `pipeline/out/terrain-screenshots/`. Software-renderer `ReadPixels` performance warnings caused by screenshot capture are reported separately; unexpected application errors and local asset failures remain fatal.

## Interaction and limitations

Open **3D Terrain**, choose **Site B** (the default Connecting Ridge site) or **Show Connecting Ridge**. Drag to rotate, scroll/pinch to zoom, right drag/two-finger drag to pan; camera buttons and numeric coordinate entry provide keyboard alternatives. Select a point, inspect its radial elevation and source RMS, then explicitly apply it to Site A or B. Site and picked-point markers are distinguished by the explanatory legend.

The planner's custom-site elevation and 250 km horizon remain derived from its existing coarser 960 m regional grid. They can differ from the local high-resolution readout. The small local DEM cannot replace missing distant terrain. Existing horizon/visibility results are not silently recomputed using a different dataset.

Resources and event handlers are disposed when the workspace closes. Rendering occurs on interaction/resize rather than continuously. The Three.js module is lazy-loaded (~144 kB gzip); Vite reports a >500 kB uncompressed chunk advisory. WebGL 2 is required; failures show a readable message and other workspaces remain usable.

Final verification fixed the baseline Google Fonts proxy certificate failure by self-hosting the same licensed Barlow faces. The unchanged full smoke suite now passes all ten workflows with no console errors or warnings. See `web/public/fonts/SOURCES.md` for sources, hashes and OFL licenses. Certificate verification was not disabled and persistent browser trust was not changed. The terrain browser suite now requires Rasterio/PyProj and the original GeoTIFF to independently verify selected points; it asserts all four local font faces load and zero external HTTP requests occur. Run `python pipeline/verify_site01_acceptance.py` to regenerate the 101-point native-source reference.

## Milestone 2 scientific overlays

The existing mesh now supports Elevation, Slope, Roughness and Hazard Assessment. Analysis comes from the native 5 m DEM before display decimation: 3×3 OLS plane slope (15 m nominal support), 5×5 detrended height RMS (25 m support). Georeferenced 5 m fields, thresholds and circular-footprint sample summaries are independent of the 20 m rendering geometry. Layer switching preserves the camera; boundary segments are visually raised 3 m only for readability. WAC remains optional, registration unverified and off by default; analysis colors override imagery while a scientific layer is selected.

See [MILESTONE2_ACCEPTANCE.md](MILESTONE2_ACCEPTANCE.md) for equations, official-slope comparison, quantitative checks and browser instructions, and [DATA_SOURCES.md](DATA_SOURCES.md) for source status. Processing: `python pipeline/hazard_site01.py` after installing the pinned terrain requirements. Do not interpret DEM-derived roughness as independently resolved obstacles or convert height RMS into a derived metric confidence interval. No M1 scientific datasets or ephemeris functions were replaced.

## Milestone 3: multiple sites and side-by-side comparison

- Assets live in `web/public/data/terrain/<siteId>/` (`site01`, `site04`, `site06`), listed in `terrain/index.json`.
- `loadTerrainAsset(signal, siteId)` and `loadHazards(signal, siteId)` reject metadata belonging to another site.
- The "Compare A and B" mode renders two `TerrainCanvas` views. They share a `CameraLink` (the camera offset in local metres) and a single set of criteria.
- `lib/terrainCompare.ts` computes the equal-footprint statistics and the three-state screen. These are pure, tested functions.
- Rebuild: `python pipeline/terrain_sites.py site04 site06 && python pipeline/terrain_sites.py --index`.

See [MILESTONE3_ACCEPTANCE.md](MILESTONE3_ACCEPTANCE.md).
