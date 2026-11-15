# Milestone 5: terrain-aware sunlight and Earth line of sight

Date: 2026-11-15. Branch `milestone-5`, based on Milestone 4 (`09f42c0`). The existing horizon masks and visibility models were audited and preserved; only gaps were added.

## Audit of existing code

| Item | Status | Detail |
|---|---|---|
| Planner horizon masks (`pipeline/horizon_mask.py`) | **Verified existing** | Great-circle rays every 0.5°, out to 250 km. Exact spherical 3D geometry (equals the d²/2R curvature drop to first order; unit-tested). Observer 2 m above ground. |
| Mask extent and terrain resolution | **Verified existing** | Polar sites: LOLA LDEM_75S_240M (0.24 km steps). Elsewhere: LDEM_16 (1 km steps, about 1.9 km pixels). Custom polar points in the browser: 960 m. Azimuth is interpolated linearly between 0.5° bins. |
| Terrain-aware vs geometric models | **Verified existing** | The upper limb must clear the terrain horizon, vs the disc centre above 0°. Both are labelled (`MODEL_LABEL`). |
| Partial disc | **Verified existing** | `discFractionAbove` (circular segment), used in power and charts |
| Combined timelines (Sun, Earth, both, neither) | **Verified existing** | `CompareLanes`, `runsSummary`. Longest darkness, longest blackout, interruptions, scrubber. |
| Long-term context maps (PGDA product 69 AVGVISIB) | **Verified existing** | Polar map overlays, labelled as averages |
| Sunlight definition | **Gap filled** | "Sun visible" (any part of the disc) is now complemented by **full disc**, **partial disc only** and **disc-weighted** sunlight in the terrain model. The geometric model shows none of these, because it does not resolve partial discs. |
| Time-dependent shadows on the 3D terrain | **Added** | Sunlight and Earth line of sight per surface point at the selected time, on all three 5 m sites, in the single and compare views |
| Permanently shadowed regions (PGDA product 90) | **Added** | 20 m LPSR map sampled on the meshes, shown as a static context layer |
| Sampling resolution statement | **Added** | 10-minute vs hourly resampling over 9 years at every polar site |

## Data sources

| Source | Use |
|---|---|
| NASA PGDA product 78 (Barker et al. 2021), Site01/04/06 5 m DEMs | 20 m display mesh (near terrain), native 5 m DEM for the independent reference |
| LOLA LDEM_75S_240M (PDS) | Far terrain outside each crop, and the planner masks |
| NASA PGDA product 90, `LPSR_80S_20MPP_ADJ.TIF` (20 m, MOON_ME/DE421, south polar stereographic) | PSR layer and PSR validation. Read through HTTP range requests of the cloud-optimised GeoTIFF, window bytes hashed in `illumination.json`. |
| NASA PGDA product 69, `AVGVISIB_75S_120M_201608` (Sun and Earth; Mazarico et al. 2011) | Independent long-term validation. The int16 values carry a scale of 4e-05, so values are fractions of time. |
| JPL Horizons (Milestone 4 ephemeris) | Sun and Earth directions, hourly 2023–2031 |

Average and static products (AVGVISIB, LPSR) are labelled as context. Only the computed layers are date-specific.

## Method for the 3D lighting layers (`lib/terrainShadow.ts`, `pipeline/illumination_sites.py`)

For a surface point, the horizon toward the Sun or Earth is the higher of two values:

1. **Inside the 8 × 8 km crop:** a march over the 20 m mesh. Steps are 20 m to 1 km, 40 m to 3 km and 80 m beyond. The march runs along the point's initial bearing in the polar stereographic plane, and ground distance accounts for the stereographic scale factor. Elevation angles use exact spherical geometry, with the observer 2 m above the point.
2. **Outside the crop:** precomputed far-field horizons from the 240 m DEM, out to 250 km. They sit on a 21 × 21 grid (400 m) × 720 azimuths, interpolated bilinearly, with a first-order correction for the point's height above or below each grid point.

A body is visible while its upper limb clears that horizon, the same rule as the planner. The visible fraction uses the circular-segment formula. Earth's radius comes from the live distance, and Earth's position from the site (libration included).

- **Evaluation grid:** every 80 m (101 × 101 points per crop), taking 0.14 s per site per hour on a desktop CPU.
- **Edge band:** points within 1 km of the crop edge depend on the coarser outside terrain. They are drawn faded and excluded from the readout statistics.

## Numerical validation

**1. Horizon angles vs an independent native 5 m reference.** The reference uses the native PGDA DEM in 5 m steps to 25 km, then the 240 m DEM, with exact geometry: 36 random points × 6 random azimuths per site (`shadow_reference.json`, checked by `terrainShadow.test.ts`). Errors are in degrees:

| Site | Inner (≥ 1 km from edge): median / p95 / max | Edge band: median / p95 / max | Mean bias |
|---|---|---|---|
| Site01 Connecting Ridge | 0.031 / 0.277 / 0.622 | 0.037 / 0.660 / 2.08 | −0.03 |
| Site04 Shackleton Rim | 0.043 / 0.668 / 1.77 | 0.034 / 1.15 / 15.4 | +0.28 |
| Site06 Nobile Rim 1 | 0.012 / 0.559 / 1.93 | 0.027 / 0.925 / 3.18 | −0.02 |

The large tail values come from close relief that the 20 m mesh smooths, and, in the edge band, from rim terrain just outside the crop (only 240 m data there). Near the pole the Sun's elevation changes by 0.1–0.5° per hour. A 0.5° horizon error can therefore move a local sunrise or sunset by one to several hours, and the UI says so.

**2. Long-term sunlight and Earth visibility vs NASA PGDA AVGVISIB.** This uses 81 points per crop (1 km grid). Ours: native 5 m + 240 m horizons, hourly 2023–2031. NASA: 120 m, 18.6-year average. Differences are in percentage points:

| Site | Sun: mean / median abs / p95 abs | Earth: mean / median abs / p95 abs | Correlation (Sun / Earth) |
|---|---|---|---|
| Site01 | −1.0 / 2.0 / 16.1 | +1.4 / 0.5 / 8.4 | 0.904 / 0.974 |
| Site04 | −1.7 / 0.9 / 6.2 | +1.0 / 0.1 / 2.5 | 0.960 / 0.960 |
| Site06 | −1.0 / 1.4 / 4.6 | +0.8 / 0.3 / 9.1 | 0.975 / 0.986 |

The largest single differences (16–36 points) occur at steep rim points, where a 120 m cell averages terrain that a point sample does not. The periods (9 vs 18.6 years) also differ.

**3. Permanent shadow consistency.**
- Site04 (Shackleton): all 33 PSR grid points have 0.0 % sunlight in our long-term calculation (NASA AVGVISIB also 0.0 %).
- In the browser algorithm, PSR vertices sampled every 61 h through 2027 were never sunlit (unit test).
- At Site01, one 20 m PSR pixel lies inside a 120 m cell that NASA's own average map shows as 43 % lit. We compute 32 % there for a 2 m observer, a resolution and observer-height effect.

**4. Hourly sampling bound** (`pipeline/sampling_bound.py`: 10-minute vs hourly, 9 polar planner sites, 2023–2031):

| | Max change in share of time | Missed short periods (9 sites × 9 years) | Longest missed | Captured transitions offset |
|---|---|---|---|---|
| Sunlight | 0.006 pp | 13 | 50 min | ≤ 50 min |
| Earth line of sight | 0.010 pp | 1 | 30 min | ≤ 50 min |

Every captured rise or set stays within the reported one-hour window. No sub-hour timing is claimed.

**5. Consistency with the planner.** At the Connecting Ridge crop centre, the 3D layer and the planner's 240 m terrain-aware state agree for more than 85 % of samples over January–June 2027 (unit test). The differences are the near-field relief that only the 5 m site resolves. The readout shows both horizon values side by side.

## Visual checks

Screenshots taken with the software renderer:
- Shackleton Rim at 2027-01-05 12:00 UTC: the sunlit rim crest and the shadowed crater interior, with 16.7 % of the inner area sunlit (13.4 % full disc). The PSR layer covers the crater floor and wall, 36.8 % of the crop.
- Compare view: Connecting Ridge at the same instant shows its sunlit ridge (37.3 %).

The faded edge band is visible in all views.

## Tests

| Suite | Result |
|---|---|
| `npm test` | 101 passed. New: `terrainShadow.test.ts` (horizon accuracy, edge band, PSR never lit, upper-limb rule, planner consistency) and `sunlight.test.ts` (full / partial / disc-weighted; none in the geometric model). |
| Python | 28 passed. New: `test_illumination_sites.py` (asset hashes, PSR values, curvature formula, PGDA agreement bounds, Shackleton PSR, sampling bound). |
| `tests/e2e/lighting_test.py` | PASS. Sunlight, Earth and PSR layers, time-slider updates, Earth disclaimer, PSR static label, compare mode, new table rows, clean console. |
| Smoke, terrain, hazard, terrain compare, astronomy | PASS. The smoke test now expects 14 table rows in the terrain model and 11 in the geometric model (intended). |
| `tsc`, ESLint, Prettier, build | 0 errors |

## Reproduce

```bash
cd pipeline
.venv/Scripts/python illumination_sites.py      # far-field grids, PSR samples, native reference, PGDA comparison (~11 min)
.venv/Scripts/python sampling_bound.py          # hourly vs 10-minute bound (~2 min)
.venv/Scripts/python -m unittest test_illumination_sites
cd ../web && npm test && npm run build && npx vite preview --port 4173
python tests/e2e/lighting_test.py http://localhost:4173/   # from repo root
```

## Limits and disclaimers (also in the UI)

- Earth line of sight is geometric. It is not an RF link budget and does not guarantee communication.
- "Sun visible" means any part of the disc. Full, partial and disc-weighted sunlight are reported separately, and partial sunlight is never counted as full power.
- No irradiance model beyond the existing simple panel estimate: no thermal model, dust or degradation.
- The 3D layers are evaluated every 80 m. Sub-80 m shadows are interpolated visually, not computed.
- Edge bands are illustrative.
- Static maps (AVGVISIB, PSR) are long-term context, not predictions for a date.
