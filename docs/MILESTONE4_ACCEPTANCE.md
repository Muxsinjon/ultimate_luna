# Milestone 4: Sun and Earth geometry (audit, then gaps only)

Date: 2026-11-15. Branch `milestone-4`, based on Milestone 3 (`3b43df0`). The astronomical engine was audited, not rebuilt.

## Audit result

| Item | Status | Evidence |
|---|---|---|
| JPL Horizons preprocessing (`pipeline/fetch_ephemeris.py`) | **Verified existing** | Target Moon 301 seen from Earth geocentre 500@399. Quantities 14 (sub-Earth point), 15 (sub-solar point), 19 and 20. DE441, MOON_ME frame (Horizons' lunar body-fixed frame), east-positive longitude, UT. Hourly 2023-01-01 to 2031-12-31 23:00. |
| Topocentric geometry (`geometry.ts`, `analysis.ts`, Python mirror `lunar_geom.py`) | **Verified existing** | ENU basis on the 1737.4 km sphere. Azimuth clockwise from north (tested: east = 90°). Elevation above the geometric 0° plane. The Earth vector is site-relative, so libration and parallax are included. |
| Two horizon models (geometric 0° / terrain-aware) | **Verified existing** | `MODEL_LABEL`, upper-limb rule, unchanged |
| Time slider, mission period, shared state | **Verified existing** | `TimeBar`, `MissionState` in the URL, `clampToCoverage`. Now also shown in the 3D terrain view. |
| Angular sizes | **Verified existing** | Earth radius `asin(6371 / d)` from the live distance; Sun fixed at 0.533° |
| Browser upsampling (6 h to 1 h) | **Improved** | Linear interpolation replaced by a uniform Catmull-Rom cubic (same file, same size) |
| Earth phase | **Fixed** | Was computed inline in a component and dropped the Sun's 0.15° Earth–Moon parallax. Now `lib/physics/earthPhase.ts`, a pure tested function using the full Sun–Earth–observer triangle. |
| 3D direction vectors | **Added** | The 3D terrain view draws Sun and Earth rays from the site, transformed through the mesh's own frame (`bodyDirectionToLocal`), with a readout panel |
| Coverage end | **Corrected documentation** | The shipped 6-hourly file ends at **2031-12-31 18:00 UTC**, not 23:00. The app already clamps there; the docs said "2023–2031". |
| Validation breadth | **Extended** | Previously 5 sites over one month (elevation only). Now 9 sites over the whole coverage, covering azimuth, elevation, Earth phase and angular size. |

## Independent reference (JPL Horizons)

`pipeline/validate_astronomy.py --fetch` sent 18 requests (9 sites × Sun `10` and Earth `399`) on 2026-11-15:

- **Observer:** `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='<lon>,<lat>,0'`.
- **Quantities:** 4 (apparent az/el), 13 (angular diameter), plus 10 (illuminated %) and 20 (range) for Earth.
- **Epochs:** `TLIST` of 40 UT epochs, with `EXTRA_PREC`.
- **Fixture:** the exact parameters and results are stored in `web/src/lib/__fixtures__/horizons_topocentric.json`.

**Sites (lon E, lat):**
- Connecting Ridge (209.94767, −89.53432), also requested as −150.05233
- Shackleton Rim Site04 (188.10719, −89.76674)
- Nobile Rim 1 Site06 (37.36812, −85.43812)
- Near south pole (45, −89.99)
- Near north pole (300, 89.9)
- Apollo 11 (23.47298, 0.67409)
- Far side (177.5991, −45.4446)
- Prime-meridian wrap (359.995, −30)

**Epochs:**
- Coverage start: 2023-01-01 00:00, 00:30 and 05:59.
- Coverage end: 2031-12-31 22:00 and 22:59, both deliberately outside the shipped data.
- UTC date change: 2027-06-30 23:00 to 2027-07-01 00:15.
- Leap day and year change: 2028-02-28/29 and 2028-12-31 23:59.
- 28 seeded random whole-minute times across 2023–2031.

## Accuracy (browser path: shipped 6-hourly file, then cubic upsampling, then in-hour interpolation, then ENU)

9 sites × 38 in-coverage epochs = 342 samples. Azimuth errors are on-sky (Δaz × cos el), computed where |el| < 80°.

| Quantity | Max | P95 | Median | RMS |
|---|---|---|---|---|
| Sun elevation | 0.00091° | 0.00074° | — | 0.00063° |
| Sun azimuth (on-sky) | 0.00031° | 0.00029° | — | 0.00016° |
| Earth elevation | 0.00593° | 0.00420° | — | 0.00144° |
| Earth azimuth (on-sky) | 0.00593° | 0.00581° | — | 0.00399° |
| Earth apparent diameter | 0.0026° | 0.0025° | — | 0.0021° |
| Earth illuminated fraction | 0.0059 pp | 0.0056 pp | — | 0.0037 pp |
| Sun apparent diameter (fixed 0.533°) | 0.0100° | 0.0099° | — | 0.0069° |

Full per-site statistics are in `docs/data/MILESTONE4_ASTRONOMY_VALIDATION.json`.

- **Earth diameter:** the 0.0026° bias comes from using the mean Earth radius (6371 km); Horizons uses the equatorial radius.
- **Sun diameter:** the fixed 0.533° disc ignores the ±1.7 % annual distance change (up to 0.010°). It is documented, and is small against hourly sampling (the Sun moves about 0.5° per hour).
- **Interpolation alone,** shipped-and-upsampled against the full hourly Horizons series (78 883 hours):

  | | Earth direction (max / P95) | Sun (max) |
  |---|---|---|
  | Cubic (Milestone 4) | 0.0014° / 0.00003° | 0.0003° |
  | Linear (before Milestone 4) | 0.0048° / 0.0036° | 0.0006° |

- **Longitude conventions:** Horizons returns identical values for 209.94767 and −150.05233, and so does the app (normalised with `normalizeLon360`).
- **Out of range:** the two epochs after 2031-12-31 18:00 return no values; the app never extrapolates. During the investigation, an extrapolating Python mirror produced errors of 0.013°. That is why the mirror now refuses out-of-range times.

## Tests

| Suite | Result |
|---|---|
| `npm test` | 93 passed. New `astronomy.test.ts` (11 tests): the Horizons fixture through the TypeScript path, longitude conventions, coverage, UTC midnight continuity, in-hour monotonicity, no extrapolation, Earth phase (full, new, quarter with parallax), polar libration range, azimuth convention, 3D ray frame. Plus a cubic-exactness test in `ephemeris.test.ts`. |
| Python | 23 passed, including `test_validate_astronomy.py` (offline bounds, scope, coverage, no extrapolation, longitude conventions) |
| `tests/e2e/astronomy_test.py` | PASS. The 3D sky readout matches Horizons (Sun within 0.002°, Earth within 0.007°). The ray direction, time-slider update, Surface View Earth phase (86 % vs Horizons 86.39 %) and the clamp for a 2035 date all check out. |
| Smoke (mission finder and others), terrain, hazard, terrain compare | PASS (no regressions) |
| `tsc`, ESLint, Prettier, `npm run build` | 0 errors |

## Reproduce

```bash
cd pipeline
.venv/Scripts/python validate_astronomy.py --fetch   # optional: re-query Horizons (network)
.venv/Scripts/python validate_astronomy.py           # compare and write the JSON report
.venv/Scripts/python -m unittest test_validate_astronomy
cd ../web && npm test && npm run build && npx vite preview --port 4173
python tests/e2e/astronomy_test.py http://localhost:4173/   # from repo root
```

## Limits

- No atmospheric refraction (none on the Moon).
- Directions are for a point on the 1737.4 km sphere. The site's true height changes the Earth vector by under 0.001° per kilometre.
- The Sun's disc is fixed at 0.533°.
- The 3D view's mesh lighting is for inspection only. Terrain shadowing on the 5 m mesh is Milestone 5.
