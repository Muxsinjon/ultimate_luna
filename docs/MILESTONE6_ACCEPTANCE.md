# Milestone 6: explainable mission-date recommendation

Date: 2026-11-15. Branch `milestone-6`, based on Milestone 5 (`ac22e2f`). The existing Mission Window Finder was audited first. It is extended, not duplicated.

## Already present vs added

| Capability | Status | Where |
|---|---|---|
| Candidate search across start times, hourly half-open samples, prefix sums | **Verified existing** | `lib/finder.ts` (`prepare`, `metricsAt`, `search`) |
| Requirements: min sunlight %, min Earth %, optional min joint %, max darkness, max blackout | **Verified existing** | `checksFor`, exact `>=` / `<=` boundaries (tested) |
| Statuses: meets / partially meets / does not meet / insufficient data | **Verified existing** | `statusFor` |
| No extrapolation outside ephemeris coverage | **Verified existing** | Candidates leaving the data are "insufficient data" (now with a stated reason) |
| "No candidate satisfies all requirements" message with suggested changes | **Verified existing** | `MissionFinder.tsx` |
| "Why this window?" built only from computed numbers, overview grid, filters and sorts | **Verified existing** | `MissionFinder.tsx` |
| Hand-off to Explore and Compare, Surface View, mission summary | **Verified existing** | Shared `MissionState` |
| **Terrain hard requirement** (max slope, max roughness, footprint radius, share of footprint meeting both) | **Added** | `TerrainReq`, `terrainCheck` |
| **Unknown terrain is insufficient data**, with the reason; terrain is never reused between sites | **Added** | `NO_TERRAIN`, `terrainScreenFrom` |
| **Soft preferences** (weights) separated from hard requirements, with a visible normalised score and per-metric contributions | **Added** | `Weights`, `scoreFor`, score column, breakdown table |
| Deterministic tie-breaking (site id last) | **Added** | `rank` |
| Terrain requirement and weights in the shareable URL (old links still parse) | **Added** | `state.ts` (`tr`, `w`) |
| Downloadable reproducible scenario (inputs, method, sources, every candidate's numbers) | **Added** | "Download scenario and results (JSON)" |
| Hand-off to the 3D terrain view | **Added** | "Open in 3D terrain" |

## Terrain screening (hard requirement)

The finder reuses the accepted Milestone 2–3 estimators on the NASA PGDA product 78 5 m DEMs:

- **Slope:** 3 × 3 OLS (15 m support).
- **Roughness:** 5 × 5 detrended RMS (25 m support).
- **Footprint:** sample-centre circle with local scale correction, centred on the site location.

A site passes when the share of valid native samples meeting both limits is at least the user's minimum.

- **Which sites can be screened:** only sites inside a processed crop (Connecting Ridge, Shackleton Rim, Nobile Rim 1, and custom points inside those crops). Every other site is **insufficient data**, with the reason "No processed 5 m terrain covers …".
- **Incomplete footprints:** a footprint with any unavailable sample is unknown. Missing data is never converted to a pass.
- **Default limits:** 10°, 0.3 m, 100 m, 90 %. These are illustrative and labelled as not NASA standards.

## Ranking formula

Ranking is lexicographic; preferences never cross a status boundary:

1. Status: meets, then partially meets, then does not meet, then insufficient data.
2. Fewer failed hard requirements.
3. Higher **preference score** (below).
4. Shorter longest darkness.
5. Earlier start, then site id.

The preference score is:

```
score = Σ wₖ · nₖ / Σ wₖ   (over preferences with wₖ > 0 and a known value)
n_sun = sun % / 100      n_earth = Earth % / 100      n_joint = joint % / 100
n_dark = 1 − longest darkness / mission length      n_blackout = 1 − longest blackout / mission length
n_terrain = footprint share meeting both limits / 100   (excluded when unknown, never counted as 0 or 1)
```

The default weights (joint 1, others 0) reproduce the pre-Milestone-6 ranking exactly. A unit test compares against the old comparator, and the original finder tests pass unchanged. Each candidate's breakdown table lists the weight, normalised value and contribution, and the contributions sum to the score.

## Tested scenarios

**Unit tests** (`finderRanking.test.ts`, 14 tests; `state.test.ts`, 7 tests):
- the exact terrain boundary;
- missing terrain, which makes a site insufficient and sorts it last;
- partial footprint coverage, which is unknown;
- a terrain failure counting as a failed requirement;
- no feasible window, where nothing is marked as meeting;
- weighted-mean arithmetic and contributions;
- unknown terrain excluded from the score;
- no weights, which gives no score;
- default weights equal to the old order;
- changed weights, which leave status and failure counts untouched;
- deterministic ties;
- an independent re-derivation of the ranking from the reported metrics;
- out-of-range starts with a reason, and an exact-fit final window;
- the blackout limit exactly at and one hour over;
- URL round-trip, old links and invalid values.

**End to end** (`tests/e2e/finder_test.py`, real NASA/JPL data). The scenario compares Shackleton Rim (Site04 DEM centre) with Nobile Rim 1 (Site06 DEM centre). It covers 14-day missions starting 1–15 January 2027 every 6 h, with an illustrative terrain requirement of ≤ 20° slope, ≤ 1 m roughness, a 100 m footprint and ≥ 90 % share.

- **Terrain screen vs an independent numpy count on the shipped 5 m layers:** Shackleton **0.0 %** (crater wall, median slope 32°) and Nobile **99.5 %**. The app's values match.
- **Terrain decides the result:** Shackleton never meets, while Nobile has windows that meet every requirement.
- **Score check:** the score breakdown sums to the displayed score.
- **Downloaded scenario (114 candidates):** every score is re-computed from its reported components. "Meets" holds exactly when all checks pass. The ranking re-sorts identically under the documented rule.
- **Hand-off:** "Open in 3D terrain" moves the shared state to the 3D view for Nobile Rim 1, with the sky readout at the window start.
- **All sites:** with all 19 listed sites, Apollo 11 and the other sites without 5 m terrain are "Insufficient data", with terrain "Unknown" and the stated reason.

**Regression:**
- 116 unit tests and 28 Python tests pass.
- The smoke (including the original finder flow), terrain, hazard, terrain compare, astronomy and lighting e2e suites pass.
- `tsc`, ESLint, Prettier and the build are clean.

The astronomy e2e once hit a 30 s timeout while all suites ran back to back on the software renderer. It passed on rerun, and no code change was involved.

## Sources

| Source | Use |
|---|---|
| NASA/JPL Horizons (DE441) | Sun and Earth geometry (Milestone 4) |
| LRO LOLA LDEM_75S_240M / LDEM_16 (PDS) | Horizon masks (Milestone 5) |
| NASA GSFC PGDA product 78 (Barker et al. 2021) | 5 m terrain for the screen (Milestones 2–3) |

No criterion is presented as an official mission standard.

## Remaining uncertainties

- **Sampling:** hourly sampling makes durations whole hours (±1 h). Milestone 5 bounds the sub-hour misses.
- **Terrain coverage:** terrain can only be screened at the three processed 5 m sites. The terrain screen uses the site location as the footprint centre; picking a different point in the 3D view is not yet fed back into the finder.
- **Terrain inputs:** the 5 m DEMs are about 90 % interpolated, and slope and roughness carry no propagated uncertainty.
- **Scope of "visibility":** line of sight does not guarantee power or communication.
