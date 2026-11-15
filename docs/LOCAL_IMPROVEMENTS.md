# Local usability and reliability improvements

**Publication update:** the user subsequently authorized creating `Muxsinjon/ultimate_luna`, pushing these results and making the website available for review. See [deployment instructions](DEPLOYMENT.md). The local-only statements below describe the completed implementation pass before that authorization.

15 November 2026. Based on `Muxsinjon/new_luna` main `42bcf0cc6cadab40b6e4cdaf9307e192a6837858` and the user's LunaWindow milestone prompt pack. This implementation is in a separate local checkout, `/workspace/lunawindow-improved`. Nothing was pushed, deployed, or published. The original `/workspace/new_luna` checkout was preserved.

## What changed

- **Whole-Moon location selection:** a textured 3D Moon replaces the polar square as the main exploration control. Drag or use arrow keys to rotate, scroll/pinch or use buttons to zoom, click or press Enter to select. The Moon uses the existing NASA LRO mosaic, with tested latitude/longitude and texture alignment. Optional day/night lighting follows the mission time; it is solar-direction context, not a claim of global terrain shadow modelling.
- **Simple dashboard:** readable Site A/B cards show current sunlight and Earth visibility, the next hourly rise/set estimate, mission sunlight and Earth percentages, and the longest darkness. Charts, blocker explanations, the original regional map and expert controls remain accessible through the full-control switch. The cards label the visibility model and distinguish Earth line of sight from a guaranteed radio link.
- **Connected actions:** use a selected location as A/B, plan there, or enter the surface view. Direct choices for Connecting Ridge, Shackleton Rim and Nobile Rim 1 expose all three verified high-resolution terrain crops. Outside those crops, the panorama and planner remain available, with a clear route to supported 3D ground.
- **Responsive custom coordinates:** the existing LOLA horizon algorithm runs in a Web Worker. Coordinates, source resolution and horizon calculation are preserved across shared links. Six decimal degrees retain picked footprint centres to about 3 cm in latitude; this is storage precision, not a claim about DEM accuracy. Old four-decimal links still load. Invalid links and failed calculations recover with an explanation.
- **Terrain-to-planning continuity:** the chosen footprint centres (single or both comparison panes), radius, slope/roughness limits and required passing share transfer into the Finder together. Incomplete criteria cannot be transferred. Returning to terrain restores the mission criteria.

## Audit findings repaired

| Finding | Correction | Regression evidence |
|---|---|---|
| Summary called a terrain-failing site compliant | One complete requirement evaluator serves Finder and reports. Required unknown terrain is insufficient data. Reports wait for terrain screening and export the actual check/reason. | Shackleton's 0% footprint fails the terrain check; IM-2's uncovered footprint is insufficient, in both displayed report and JSON. |
| Finder mixed old results with new inputs | A search key covers dates, duration, sites, scope, cadence, visibility model, requirements and weights. Changing any of them removes old result actions/exports until recalculation. | Browser edits dates, model, cadence and scope; unit tests cover every scientific input and display-only changes. |
| Duration change allowed mission beyond coverage | Every shared mission patch passes through coverage clamping. Finder has an explicit physical ephemeris endpoint. Reports reject incomplete coverage before calculating percentages. | December 30, 2031, 1 → 30 days ends at or before December 31, 18:00 UTC, with a complete report. Exact endpoint boundary is unit-tested. |
| Looking around advanced mission time | View controls consume navigation keys; the global shortcut respects handled events and view focus. | Arrow and Shift+arrow change look direction without changing the selected time. Existing time-slider tests still pass. |
| Theme switch broke first-person scene | Each scene is initialized from the current camera, bodies, horizon and shading state. | Dark/light/dark retains view and projected Sun/Earth/shadow state. Existing pixel-probe tests still verify visible/occluded Sun rendering. |

The first-person view also clears previous-site loading errors. Changing camera height now explicitly explains that the calculated visibility, shadow overlays and distant horizon retain the 2 m observer model.

## Reference project review

Reviewed [`astoreyai/lunar-lighting-planner`](https://github.com/astoreyai/lunar-lighting-planner) at `e079015ad22dd19d11cedf5122f479889a635d10` (Apache-2.0). Its whole-Moon interaction, plain-language cards, progressive disclosure and direct exploration-to-planning actions informed these changes. Implementation was written for LunaWindow's React/Preact and Three.js architecture; no reference repository source or datasets were copied.

Its wider ephemeris coverage, alternate DEM products, global cast-shadow implementation, analog-crew mode and different mission verdict model were not transplanted: those require separate source verification and scientific validation. LunaWindow retains its validated 2023–2031 ephemeris, native 5 m hazard estimators, 20 m display meshes, existing shadow calculations, hard-requirement ranking and optional environmental layers. A spherical texture and day/night appearance are never presented as new high-resolution elevation measurements.

## Validation

- TypeScript and production build, ESLint, Prettier check.
- **144 unit tests across 22 files**, including globe projection/texture alignment, shared-link validation, complete requirements, coverage endpoint and stale-search identity.
- **Python: 34 discovered, 27 passed, 7 skipped**. Skips need optional raw-source caches; no scientific datasets were regenerated for this UI change.
- **12 browser suites passed:** existing smoke, astronomy, lighting, Finder, terrain comparison, first-person surface, science layers, offline journey, no-WebGL fallback, native terrain picking and hazard suites; plus `tests/e2e/improvements_test.py` for the new workflow and audit regressions. The legacy terrain test now checks the higher-precision custom ID; the comparison test checks the renamed action and rejects incomplete criteria.
- Desktop and 390 px phone screenshots, visually reviewed in both themes. Emulated two-finger pinch zoom and touch picking passed without unintended selection. The new regression journey blocks external requests and requires a clean console. Expected software-renderer notices and deliberately injected HTTP failures retain the existing suites' documented filtering.

The full suites ran after the functional integration. Final explanatory-label refinements were followed by another build, lint, format and unit run, plus smoke, the new regression journey, source-backed hazard checks and touch/theme checks.

Logs, JSON exports and screenshots for this workspace are in `/workspace/luna-improvement-evidence/`. The preceding audit's independent 482,403 native-source mesh comparisons and fresh Horizons spot check remain in `/workspace/audit-new-luna/`; they are earlier evidence, not newly repeated source downloads.

No physical headset, real mobile GPU or assistive-technology user study was available. WebXR remains optional and unverified on hardware. Native 5 m terrain exists only in the three processed crops; rendered meshes use 20 m spacing, shadow fields 80 m. Custom planner horizons use the coarser regional/global terrain. The last source-backed hazard check reused the audit-generated full-precision GeoTIFFs and agreed within 0.000474° slope and 0.000315 m roughness. Optional environmental dataset registration limits and deferred Milestone 8 layers remain as documented. This is planning/education software, not a landing-safety certification.

## Run and review

```bash
cd /workspace/lunawindow-improved/web
npm ci                    # needed in a fresh checkout; this workspace already has dependencies
npm run build
npm run preview -- --host 0.0.0.0 --port 4191 --strictPort
```

Open `http://localhost:4191/#ws=compare&ui=simple` in a browser connected to this environment. Select **Connecting Ridge**, then **View from the surface** to enter the working first-person terrain view. Use **Show all controls** for the detailed science tools.

```bash
cd /workspace/lunawindow-improved/web
npm run lint
npm run format:check
npm test
cd ..
CHROMIUM=/usr/bin/chromium pipeline/.venv/bin/python tests/e2e/improvements_test.py http://localhost:4191/ --evidence /workspace/luna-improvement-evidence
```

For other machines, use a locally installed Chromium path (or Playwright's installed browser) and install the Python test requirements. Existing browser scripts accept a base URL; the cloud's local wrapper only selects `/usr/bin/chromium` for scripts without an executable option.

The recovery patch at `/workspace/luna-improvements.patch` is relative to upstream `42bcf0c`. Review/apply it only to a matching clean checkout with `git apply --check` first. Local commit details and final test evidence are recorded alongside it. No remote is configured in this isolated work copy.
