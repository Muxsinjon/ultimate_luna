# LunaWindow scientific data inventory

Updated 2026-11-14. Reference directory: user-supplied `Lunar_Landing_Navigator_NASA_JPL_Data_Sources.docx` (17 categories). That document is a discovery directory, not verification. Status below distinguishes existing integration, newly verified products and future/uninspected collections. No remote publication is implied.

## Redesign imagery (story scene)

`pipeline/make_textures.py` writes `web/public/textures/` (5 JPGs, about 1.5 MB). Each source URL, SHA-256 and credit is recorded in `textures.json`. These are display textures; tone adjustments are display-only, with no geometric change.

| File | Source | Credit |
|---|---|---|
| moon_color.jpg (2048 × 1024) | SVS 4720 `lroc_color_poles_2k.tif` | NASA SVS CGI Moon Kit (LRO LROC WAC) |
| moon_height.jpg (1024 × 512) | SVS 4720 `ldem_3_8bit.jpg` | NASA SVS CGI Moon Kit (LRO LOLA) |
| earth.jpg (4096 × 2048) | SVS 3615 `flat_earth_Largest_still.0330.jpg` (Earth with clouds) | NASA GSFC Scientific Visualization Studio (Greg Shirah) |
| stars_bsc5.json (8,404 stars, V ≤ 6.5) | NASA HEASARC `heasarc_bsc5p.tdat.gz` (Yale Bright Star Catalogue, 5th ed.), via `pipeline/make_stars.py` | NASA HEASARC; J2000 RA/Dec, V mag, B−V |
| stars.jpg (2048 × 1024) | SVS 4851 `hiptyc_2020_4k_print.jpg` | NASA SVS Deep Star Maps (Hipparcos-2, Tycho-2) |
| earth_night.jpg (2048 × 1024) | SVS 30028 `earthatnight2012_print.jpg` | NASA Black Marble 2012 (Suomi NPP VIIRS) |
| sun.jpg (1024 × 1024) | SDO `latest_1024_0304.jpg` (2026-11-15) | NASA/SDO and the AIA science team |

## Milestone 8 science overlay records

| Record | Product / file | Use | Notes |
|---|---|---|---|
| Diviner Polar Resource Products | PDS Geosciences `urn:nasa:pds:lro_diviner_derived1:data_derived_prp:dlre_prp_south` (`LRO-L-DLRE-5-PRP-V2.0`), 604,800,210 bytes, SHA-256 `393deaa5d8925d45bb2ed608f937a824f5eae029c2558aad1d2da8206b83a62d` | model-derived annual maximum / average (2 cm) temperature and ice-stability depth on the 5 m sites | thermal-model fits to the first mapping year; Kaguya-DEM triangles about 0.5 km; −999 = deeper than 2.87 m; −1 undocumented (not interpreted) |
| ShadowCam controlled mosaic shackleton01 | `derived/cmosaic/shackleton01/..._20m_cog.tif` (20 m, polar stereographic, R 1737.4 km) | observed I/F in the Shackleton permanent shadow (Site04 only) | window bytes hashed in `terrain/site04/science/index.json` |

Deferred or rejected candidates and the reasons are listed in [MILESTONE8_ACCEPTANCE.md](MILESTONE8_ACCEPTANCE.md).

## Milestone 7 immersive view records

No new downloads. The first-person view reuses:
- PGDA product 78 meshes (Milestone 1/3);
- Milestone 5 far-field horizons and PSR inputs;
- the Horizons ephemeris (Milestone 4).

Surface imagery is deliberately not used:
- LROC WAC registration is unverified (Milestone 1).
- LROC NAC / QuickMap and ShadowCam products were not integrated, because no registered, licence-checked tiles for the crops exist in the repository.

## Milestone 6 finder records

No new external data. The finder combines existing, attributed inputs:
- JPL Horizons geometry (Milestone 4);
- LOLA horizon masks (Milestone 5);
- PGDA product 78 5 m slope and roughness (Milestones 2–3), only at the processed sites and never transferred between sites.

The downloaded scenario JSON lists these sources and the method.

## Milestone 5 illumination records

| Record | Product / file | Use | Notes |
|---|---|---|---|
| PGDA product 90 permanently shadowed regions | `LPSR_80S_20MPP_ADJ.TIF` (20 m, south polar stereographic, MOON_ME/DE421, 0/1) | static PSR context layer on the 3D sites; PSR validation | read by HTTP range (COG window) per crop; window bytes hashed in `terrain/<site>/illumination/illumination.json` |
| PGDA product 69 average visibility | `AVGVISIB_75S_120M_201608(_EARTH).TIF` (int16, scale 4e-05 = fraction of time) | independent long-term validation of computed sunlight / Earth visibility | existing raw files; 18.6-year average at 120 m, not a date prediction |
| Far-field horizon grids | derived from LOLA LDEM_75S_240M | terrain outside each 8 km crop for the 3D lighting layers | `far_el.i16` (0.01°), `far_d.u16` (0.1 km), 21 × 21 × 720 per site |

## Milestone 4 astronomy records

| Record | Request | Use |
|---|---|---|
| JPL Horizons ephemeris (verified existing) | target 301, center 500@399, quantities 14,15,19,20, hourly 2023-01-01 to 2031-12-31 23:00 UT, DE441 | sub-Earth and sub-solar points in MOON_ME. Shipped every 6 h (coverage ends at the last shipped row, 2031-12-31 18:00 UTC) and upsampled with a cubic in the browser |
| JPL Horizons topocentric reference (new) | 18 requests: targets 10 and 399, CENTER coord@301, GEODETIC sites, TLIST of 40 UT epochs, quantities 4,13 (+10,20 for Earth), EXTRA_PREC | independent validation only (`web/src/lib/__fixtures__/horizons_topocentric.json`, `docs/data/MILESTONE4_ASTRONOMY_VALIDATION.json`) |

## Milestone 3 multi-site records

| Record | Product / file | Use | Notes |
|---|---|---|---|
| PGDA product 78 Site04 | `Site04_final_adj_5mpp_surf/toterr/slp.tif` | 20 m mesh, height RMS, OLS slope/roughness; NASA slope as a cross-check only | README name "Shackleton rim"; surf SHA-256 pinned `38ff70db…`; 3200² at 5 m |
| PGDA product 78 Site06 | `Site06_final_adj_5mpp_surf/toterr/slp.tif` | as above | README name "Nobile rim 1"; missing from the HTML file index but served at the documented path and verified as a GeoTIFF; surf SHA-256 pinned `cca17e80…`; 4000² at 5 m |
| Terrain index | `web/public/data/terrain/index.json` | site list, product, crop centre and its source, extent, source URL and hash | written by `terrain_sites.py --index` |

The crop centres for Site04 and Site06 are the DEM centre pixels, because no landing coordinate is published. Same frame (MOON_ME/DE421), east-positive longitude, units (m, °, m RMS), NaN / 65535 NoData and 5 m / 20 m resolutions as Site01.

## Milestone 2 active scientific records

All three local Site01 products are NASA GSFC PGDA / LRO LOLA, [product 78](https://pgda.gsfc.nasa.gov/products/78), Barker et al. (2021), doi:10.1016/j.pss.2020.105119. Prefix for exact files: `https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/`.

| Product / exact file | Status / feature | Metadata and processing |
|---|---|---|
| `Site01_final_adj_5mpp_surf.tif` | Verified, integrated; existing elevation, new source-derived slope and roughness | 3200 × 3200 Float32, 5 m pixel centres; X −19000…−3000 m, Y −20000…−4000 m; south-polar stereographic, 1737400 m sphere, central meridian 0, pole −90°, MOON_ME/DE421; height Z metres per official README (band unit tag unset); NaN NoData, scale 1/offset 0. SHA-256 `3ba7b97cb00a2bcf21189c3aeb535f65afc21207154ab9f0d43c5bdc1f7e747e`. 5 m source processed before display sampling. About 90% of original pixels are interpolated; effective resolution is not 5 m independent measurements. |
| `Site01_final_adj_5mpp_toterr.tif` | Verified, integrated in Milestone 1; point uncertainty retained in Milestone 2 | Same grid/CRS/coverage; total Z RMS error in metres, not a confidence interval for derived slope/roughness. Full-source median ~0.372 m. SHA-256 `cf2cf52f52d2aa51e60d058010d10b0ebfb1d3e920f5a2b9a46eb6c51054ab1c`. Correlated errors cannot be propagated as independent pixel noise without more evidence. |
| `Site01_final_adj_5mpp_slp.tif` | Newly verified and loaded for numerical comparison, not primary screening raster | HTTP 200, image/tiff, 40,980,776 bytes; Last-Modified 2020-06-08. Same 3200 × 3200 grid, 5 m spacing, projection/coverage/NaN/scale/offset as DEM (checked). Slope in degrees per NASA README; precise numerical estimator/support not established in that README. SHA-256 `3a90035a4946b4a04b7332c52f0b2b1cff71648bd8c105e14d8a7e15c6bcfe8e`. Our explicitly defined 3×3 OLS estimator is compared rather than silently equated with this product. Full metadata and difference statistics are in `web/public/data/terrain/site01/hazards/hazards.json`. |

New derived layers: OLS plane slope at native 5 m sampling, nominal 15 m pixel support; detrended OLS height residual RMS at native 5 m sampling, nominal 25 m square support. These are **derived calculations from an interpolated NASA DEM**, not new laser measurements. Complete neighbourhoods only; a source halo supports edges of the 8 km display crop. Browser quantization is 0.001° / 0.001 m, with 65535 as unavailable; no resampling from the 20 m mesh. Full-precision scientific GeoTIFFs remain in ignored `pipeline/out/hazards/`. Science equations, boundaries, uncertainty and numerical results: [MILESTONE2_ACCEPTANCE.md](MILESTONE2_ACCEPTANCE.md).

## Roughness suitability investigation

[Product 98](https://pgda.gsfc.nasa.gov/products/98) was accessed and inspected on 2026-11-14. Despite its general title, its current products are **north polar** (`80N`, etc.), unsuitable for Connecting Ridge. No north-pole raster was integrated.

[Product 90](https://pgda.gsfc.nasa.gov/products/90) was accessed and inspected. It lists south-pole `LDRM_80S_*MPP_ADJ_ROUGH_*M.TIF`: individual LOLA spot residual spread about a plane fitted to the DEM in a **circular baseline diameter** (100, 200, 400, 800, 1600 m), at 50 m or 1000 m sampling. These are available regional measurements with different support, sampling and input definitions; they are **rejected as a substitute for our local 25 m square DEM-residual metric**. No such raster was downloaded or claimed inspected at raster level. Example catalog filename: `LDRM_80S_50MPP_ADJ_ROUGH_100M.TIF`. Regional CRS is south-polar stereographic MOON_ME/DE421; exact candidate raster footprint, NoData and uncertainty remain uninspected. Do not mix these metrics in a common threshold without a separate scientifically defined conversion/comparison. Citation for regional products: Barker et al. (2023), PSJ 4, 183, doi:10.3847/PSJ/acf3e1; data doi:10.60903/gsfcpgda-lola-spole.

## All 17 directory categories

For **planned** entries, no exact file is selected and raster resolution, footprint, CRS, NoData and uncertainty remain unverified; intended quantities below do not assert product metadata. Do not report these as integrated. Existing integration details for astronomy/context are documented in README and Milestone 1 documentation.

| # | Category / organization | Official directory | Status / intended or existing use |
|---|---|---|---|
| 1 | Local elevation / NASA LOLA | [PGDA 78](https://pgda.gsfc.nasa.gov/products/78) | Verified/integrated: exact Site01 records above. |
| 2 | Large-area elevation / NASA LOLA | [PGDA 90](https://pgda.gsfc.nasa.gov/products/90) | Catalog verified, new regional rasters planned/uninspected. Existing `LDEM_75S_240M` and `LDEM_16`-derived regional grids serve 250 km horizons and remain unchanged. |
| 3 | Surface images / LROC | [PDS directory](https://pds.lroc.im-ldi.com/data), [QuickMap](https://quickmap.lroc.im-ldi.com/) | Directories only; existing actual NASA Trek `LRO_WAC_Mosaic_Global_303ppd_v02` is optional context, ~100 m nominal, geographic Moon 2000 to local polar warp. Independent registration unverified/off by default; exact tile hashes/transforms in M1 provenance. No new imagery in M2. |
| 4 | Surface slopes / NASA LOLA | [PGDA 78](https://pgda.gsfc.nasa.gov/products/78) | Site01 official slope verified/comparison loaded; native DEM-derived OLS slope integrated with explicit method above. |
| 5 | Roughness / NASA LOLA | [PGDA 98](https://pgda.gsfc.nasa.gov/products/98), [south-pole 90](https://pgda.gsfc.nasa.gov/products/90) | Catalogs checked; northern coverage rejected, regional metrics not equivalent. Native Site01-derived local RMS integrated, clearly distinct. |
| 6 | Sun geometry / JPL Horizons | [API documentation](https://ssd-api.jpl.nasa.gov/doc/horizons.html) | Existing integrated hourly MOON_ME Sun vectors 2023–2031, shipped at 6 h and interpolated; not terrain shadows by themselves. |
| 7 | Mean illumination / NASA LOLA | [PGDA 69](https://pgda.gsfc.nasa.gov/products/69) | Existing `AVGVISIB_75S_120M_201608.TIF`-derived context; percent long-term visibility, not a date-specific forecast. Browser polar overlays retained. |
| 8 | Permanent shadow / NASA LOLA | [PGDA 90](https://pgda.gsfc.nasa.gov/products/90) | Planned exact PSR rasters/shapefiles; catalog contains LPSR products, files not integrated. |
| 9 | Mean Earth visibility / NASA LOLA | [PGDA 69](https://pgda.gsfc.nasa.gov/products/69) | Existing `AVGVISIB_75S_120M_201608_EARTH.TIF`-derived context, not instantaneous radio availability. |
| 10 | Earth geometry / JPL Horizons | [API documentation](https://ssd-api.jpl.nasa.gov/doc/horizons.html) | Existing hourly Earth vectors, km, MOON_ME, including libration; terrain masks retained. |
| 11 | Temperature / Diviner | [UCLA](https://www.diviner.ucla.edu/data), [NASA PDS](https://pds-geosciences.wustl.edu/missions/lro/diviner.htm) | Planned; thermal context only, no temperature raster integrated or validated in M2. |
| 12 | Craters/boulders/local hazards / LROC NAC | [NAC DTM catalog](https://data.lroc.im-ldi.com/lroc/view_rdr/SHAPEFILE_NAC_DTMS) | Planned exact stereo/imagery products; no object detection or obstacle-resolution claim. |
| 13 | Hydrogen/volatile indicators / LEND, Mini-RF | [LEND](https://pds-geosciences.wustl.edu/missions/lro/lend.htm), [Mini-RF](https://pds-geosciences.wustl.edu/missions/lro/mrf.htm) | Planned/uninspected; no direct accessible-water-ice claim. |
| 14 | Mineralogy/hydration / M3 | [NASA PDS](https://pds-imaging.jpl.nasa.gov/volumes/m3.html) | Planned/uninspected spectral context, not terrain safety data. |
| 15 | Shadowed-region imagery / ShadowCam | [PDS archive](https://pds.shadowcam.im-ldi.com/) | Planned/uninspected. No ShadowCam texture or registration claim. |
| 16 | Radiation / CRaTER | [NASA PDS/PPI](https://pds-ppi.igpp.ucla.edu/mission/LUNAR_RECONNAISSANCE_ORBITER) | Planned/uninspected; surface-dose inference would require a model. |
| 17 | Advanced geometry / JPL SPICE | [NAIF generic kernels](https://naif.jpl.nasa.gov/naif/data_generic.html) | Planned exact kernels; no new SPICE integration. Existing Horizons model preserved. |

Only the new local slope comparison raster was additionally downloaded for M2. The listed future URLs are source-directory references from the attached document, **not claims that every endpoint/product was verified accessible**. No unrelated datasets were acquired. This inventory and acceptance report are shared technical context for Codex/Claude or other maintainers.
