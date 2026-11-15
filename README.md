# LunaWindow

**Explore. Compare. Plan. Experience.** Find the right place and time to land on the Moon.
This project is for the NASA Space Apps Challenge 2026: [Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).

![Explore & Compare: Nobile Rim 2 vs Connecting Ridge, with Sun and Earth elevation, visibility timeline and comparison table](docs/screenshots/after/compare-1440.png)

**Where and when should a lunar mission operate to get sunlight and a direct line to Earth?** At the lunar south pole the Sun skims the horizon, so a single ridge decides whether a lander has power, and Earth's monthly wobble decides whether it can call home.

LunaWindow connects three things in one decision-support tool:
- your **mission requirements**,
- **NASA astronomical and terrain data** (JPL Horizons, LRO LOLA),
- an **observer's view from the lunar surface**.

It answers three questions:
- **Where?** Which site.
- **When?** Which dates.
- **Why?** Which Sun and Earth geometry explains the result.

It is a preliminary tool and does not certify landing safety.

**Current source (all milestones):** https://github.com/Muxsinjon/new_luna. The older public demo at https://muxsinjon.github.io/lunawindow/ shows the pre-milestone version (no 5 m terrain, first-person view or science layers) and is kept unchanged.

**Final demo and release evidence:** [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) · [docs/MILESTONE9_ACCEPTANCE.md](docs/MILESTONE9_ACCEPTANCE.md) · [docs/SUBMISSION.md](docs/SUBMISSION.md) · [CHANGELOG.md](CHANGELOG.md)

## Workspaces (one shared mission state, in the URL)
- **Welcome:** choose "Explore landing sites" or "Plan a lunar mission", or **Try the guided demo**, a 10-step walkthrough on real data.
- **Explore & Compare:**
  - Site A vs Site B from 17 cited sites (or your own coordinates, or a click on the south-pole map).
  - Mission start, a 1/3/7/14/30-day duration and a shared time bar (previous/next hour, play, speed).
  - Status per site: Sun and Earth azimuth and elevation, visible or not, next rise or set as an hour window.
  - **Sun elevation and Earth elevation vs time** charts for both sites, with a 0° line, tooltips and a synced cursor.
  - A **visibility timeline** (Sun, Earth, both, neither) with **Highlight differences**.
  - A **comparison table** (11 metrics, including blackouts, interruptions and longest continuous intervals) with generated **trade-off** sentences.
- **Mission Window Finder:**
  - Your requirements: duration, earliest and latest start, minimum sunlight %, minimum Earth %, optional minimum joint %, maximum darkness, maximum blackout. The defaults are illustrative, not NASA standards.
  - It searches **all sites** in about half a second and sorts every candidate into **Meets / Partially meets / Does not meet / Insufficient data**, with a transparent ranking (hard requirements first).
  - A site × day overview grid and a sortable, filterable results list.
  - **Why this window?** explains which requirements pass or fail using the actual numbers (e.g. *"The modeled uninterrupted loss of Earth visibility is 50 h, while the mission allows only 48 h"*), plus the best period, the critical interruptions and the alternatives. From there you can jump to Explore & Compare, Surface View or the critical moment.
- **Surface View:**
  - The 360° view from the site: a black sky, the real LOLA terrain silhouette, and the Sun and Earth at their true angular sizes (Earth's phase is computed).
  - Drag to look around, Look at the Sun / Look at Earth, field of view, an optional labelled vertical exaggeration, a compass strip and a 360° overview.
  - A plain-language reason for the current visibility state.
- **Mission summary:** a printable HTML/PDF report or a JSON download (sites, coordinates, dates, requirements, metrics, pass/fail, interruptions, sources, limitations).
- **About & methodology:** both visibility models, the sampling method, datasets, the supported sites and dates, validation and limitations.

Header switches:
- **Terrain-aware ↔ Geometric 0°** visibility model
- **Planner ↔ Explain** (plain-language mode)
- **UTC ↔ local time**
- dark or light theme
- **Copy link**: any view can be shared exactly.

## Visibility models
| Model | Visible when… | Label shown next to results |
|---|---|---|
| Terrain-aware (default) | the upper edge of the disc is above the LRO LOLA terrain horizon | "Terrain-aware visibility: upper limb above the LRO LOLA horizon (240 m terrain)" |
| Geometric 0° | the disc centre is above the smooth geometric horizon | "Geometric visibility — local terrain obstruction not included." |

Both models use **hourly samples on half-open intervals**: a sample covers the following hour, and durations are whole hours. Rise and set times are reported as one-hour windows. Dates outside 2023–2031 are never extrapolated; they're adjusted with an explanation, or marked "insufficient data".

## How it works

```mermaid
flowchart LR
  subgraph NASA["NASA data (public)"]
    H["JPL Horizons API<br/>DE441"]
    L["LRO LOLA DEMs<br/>LDEM_75S_240M, LDEM_16"]
    P["PGDA polar illumination<br/>(Mazarico et al. 2011)"]
  end
  subgraph Pipeline["pipeline/ (Python, offline)"]
    E["fetch_ephemeris.py<br/>sub-solar and sub-Earth points, MOON_ME, hourly 2023–2031"]
    M["horizon_mask.py<br/>720 rays × 250 km on a curved Moon"]
    V["validate_*.py<br/>vs Horizons, PGDA, Chandrayaan-3"]
  end
  subgraph Web["web/ (static app, no server)"]
    D[("public/data<br/>~4.5 MB")]
    G["physics/*.ts<br/>pure, unit-tested"]
    U["React UI<br/>(Preact runtime in production)"]
  end
  H --> E --> D
  L --> M --> D
  P --> V --> D
  D --> G --> U
```

1. **Sun and Earth.** For every hour from 2023 to 2031, Horizons gives the sub-solar and sub-Earth points on the Moon in the body-fixed frame. The browser turns them into azimuth and elevation for *any* lunar coordinate, including libration. A 6-hour file is shipped and interpolated back to hourly in the browser, which adds no measurable error.
2. **Real horizon.** For each site we cast 720 rays out to 250 km over LOLA terrain, using exact spherical geometry: the curvature drop d²/2R with R = 1737.4 km, no refraction. Custom spots are computed in the browser from a 960 m grid.
3. **Mission meaning.** Sunrise and sunset happen when the **upper limb** crosses the terrain. Partial visibility is the disc area above the horizon. From these windows we derive countdowns, the operations window, the longest dark period, power and the landing calendar.

## Validation (details: [docs/VALIDATION.md](docs/VALIDATION.md))
| Check | Result |
|---|---|
| Sun and Earth elevation vs JPL Horizons topocentric, 3 sites × 3 times (browser code path, unit-tested) | worst **0.0034°** (the Sun's disc is 0.533° wide) |
| Sunlit and Earth-visible % vs LOLA team maps, 7 polar sites | within **1–7 percentage points** |
| Chandrayaan-3 (2023): predicted local sunset | **2023-09-04 09:00 UTC**. ISRO put Vikram to sleep early that day, ahead of the lunar night |
| Shackleton crater floor over a full year | **0 %** sunlit (permanent shadow), as expected |

## Run locally
```bash
cd web
npm ci
npm run dev        # http://localhost:5173
npm test           # 127 unit tests (physics, terrain, hazards, shadows, finder, astronomy vs Horizons, state)
npm run lint && npm run build
```

Playwright smoke tests (Python):
```bash
pip install playwright && python -m playwright install chromium
cd web && npx vite preview --port 4173 &
python ../tests/e2e/smoke_test.py http://localhost:4173/
python ../tests/e2e/journey_test.py http://localhost:4173/   # full release journey, offline, writes docs/screenshots/demo
```
The other browser suites in `tests/e2e/` (terrain, hazard, compare, astronomy, lighting, finder, surface 3D, science, no-WebGL) use the same command. The terrain and science scripts need the pipeline environment (`pipeline/.venv`, numpy and rasterio).

Rebuild the data (about 200 MB of NASA downloads into `pipeline/raw/`, which is gitignored):
```bash
cd pipeline
python -m venv .venv && .venv/Scripts/pip install numpy requests rasterio pyproj playwright
.venv/Scripts/python fetch_ephemeris.py       # JPL Horizons -> ephem.bin
.venv/Scripts/python horizon_mask.py          # LOLA -> sites.json, browser DEMs
.venv/Scripts/python export_overlays.py       # PGDA -> map overlays
.venv/Scripts/python validate_ephemeris.py    # vs Horizons topocentric
.venv/Scripts/python validate_illumination.py # vs PGDA maps
.venv/Scripts/python validate_missions.py     # Chandrayaan-3
.venv/Scripts/python validation_table.py      # docs/VALIDATION.md + test fixture
.venv/Scripts/python make_brand_assets.py     # OG image and favicons
```
The DEMs come from `http://imbrium.mit.edu/DATA/LOLA_GDR/` (`POLAR/IMG/LDEM_75S_240M.*`, `CYLINDRICAL/IMG/LDEM_16.*`). The illumination maps come from `https://pgda.gsfc.nasa.gov/data/MoonIllumination/` (`AVGVISIB_75S_120M_201608.TIF`, `..._EARTH.TIF`).

## Deploy
`.github/workflows/pages.yml` builds, tests and publishes to GitHub Pages, but in `new_luna` it is **manual-only** (`workflow_dispatch`) so nothing is deployed without a decision. To publish, set Pages to use GitHub Actions in the repository settings, then run the workflow. The static build in `web/dist/` uses relative asset paths (`base: './'`), so any static host can serve it from any sub-path. `ci.yml` runs lint, format check, unit tests, build and the Playwright smoke tests.

## Tech stack
TypeScript (strict), React 19 API (Preact runtime in production builds), hand-written SVG charts, Vite, Vitest, ESLint, Prettier, hand-written SVG and canvas charts, and Python (NumPy, rasterio, Playwright) for the data pipeline. Design system: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).

## References
**NASA data**
- JPL Horizons System, DE441. https://ssd.jpl.nasa.gov/horizons/ (API retrieved 2026-11-14)
- LRO LOLA Gridded Data Records LDEM_75S_240M and LDEM_16 (Smith et al., LOLA team), NASA PDS. http://imbrium.mit.edu/DATA/LOLA_GDR/
- Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011). Illumination conditions of the lunar polar regions using LOLA topography. *Icarus* 211, 1066–1081. Data: https://pgda.gsfc.nasa.gov/products/69
- Barker, M. K. et al. (2021). Improved LOLA elevation maps for south pole landing sites. NASA GSFC PGDA product 78 (5 m site DEMs, slope, uncertainty): https://pgda.gsfc.nasa.gov/products/78
- Barker, M. K. et al. A new view of the lunar south pole from LOLA. PGDA product 90 (LPSR permanently shadowed regions, 20 m): https://pgda.gsfc.nasa.gov/products/90
- Paige, D. A. et al. (2010), Science 330; LRO Diviner Polar Resource Products, LRO-L-DLRE-5-PRP-V2.0, NASA PDS Geosciences
- KPLO ShadowCam controlled mosaic shackleton01, ShadowCam PDS archive: https://pds.shadowcam.im-ldi.com/
- LROC QuickMap (context and site checks): https://quickmap.lroc.asu.edu/
- CSA Moon Exploration portal (Space Agency Partner resource): https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/

**Landing-site coordinates** (each site also shows its source in the app)
- Artemis III 2023 workshop abstract #2036 (Connecting Ridge, Peak near Shackleton): https://www.hou.usra.edu/meetings/Artemis_III_2023/pdf/2036.pdf
- Evaluating potential landing sites for the Artemis III mission, *Acta Astronautica* 226 (2025) 469 (Nobile Rim 2): https://arxiv.org/abs/2406.19863
- IM-1 (LROC), IM-2 (Wikipedia "IM-2"), Blue Ghost Mission 1 (LROC/Firefly), Apollo 11–17 (LROC/NASA), Chandrayaan-3 (ISRO), SLIM (JAXA), Chang'e 4 (LROC). Sites marked "Needs verification" are flagged in the app.

**Mission record (validation)**
- The National, 5 Sep 2023, "India's Chandrayaan-3 mission lander and rover in sleep mode for lunar night".
- India TV News, 21 Sep 2023, on the 22 Sep wake-up attempt.

**Software** (all open source): React, Preact, Vite, Vitest, TypeScript, ESLint, Prettier, Playwright, NumPy, rasterio, pyproj, requests. **Fonts:** Barlow and Barlow Semi Condensed (Jeremy Tribby, SIL OFL), self-hosted from Google Fonts; source hashes and licenses are in `web/public/fonts/`.
**Images:** all original. The favicon and OG image are SVG drawn by code from our own LOLA horizon data; the code was written with AI assistance, and the OG image says so visibly. No NASA logos or insignia are used, and no image-generator output.

## Use of AI
We used an AI coding assistant (Anthropic Claude) for code, tests, data-processing scripts and documentation, under the team's direction. The team chose the idea and approach. Every task is logged with dates and files in [docs/AI_USAGE.md](docs/AI_USAGE.md). The same disclosure is in machine-readable metadata: an `ai-assistance` meta tag in `web/index.html` and `provenance.aiDisclosure` in every exported JSON, as the 2026 Space Apps rules require. Scientific values are computed from NASA/JPL data by the documented pipeline and validated against independent references; they are not AI-generated.

## Team
_Add team member names and roles here._

## License
MIT for the code ([LICENSE](LICENSE)). The NASA data is public domain; please cite the sources above.

## 3D lunar terrain explorer

The **3D Terrain** workspace provides a real Three.js terrain mesh from NASA PGDA's Connecting Ridge **Site01 5 m LOLA DEM**, with rotation, zoom, pan, surface-point selection and lunar coordinate/elevation/RMS readouts linked to Site A/B. The browser uses a documented 20 m mesh over 8 × 8 km. Optional real LROC WAC imagery is projected onto that terrain as coarse context; independent landmark co-registration is unverified and the texture is off by default.

Existing mission planning, comparisons, astronomical calculations and 360° Surface View are preserved. See [project status](docs/PROJECT_STATUS.md) and [verified sources, processing and tests](docs/TERRAIN_3D.md) for source uncertainty, decimation error, image limitations and local review commands.

Final Milestone 1 results: [acceptance report](docs/MILESTONE1_ACCEPTANCE.md).

## Scientific terrain screening (Milestone 2)

Within **3D Terrain**, select a location and use **Scientific terrain analysis** to view slope, detrended RMS roughness and threshold-based hazard overlays. Configure slope/RMS requirements and a circular footprint to inspect sample-based coverage and min/mean/max statistics. Native 5 m data drives science; the 20 m mesh is display geometry only. This screens selected terrain criteria, not all landing hazards. See [acceptance and limitations](docs/MILESTONE2_ACCEPTANCE.md) and [data inventory](docs/DATA_SOURCES.md).

## Multi-site terrain comparison (Milestone 3)

In **3D Terrain**, choose **Compare A and B** to see two NASA LOLA 5 m sites side by side: Connecting Ridge (Site01), Shackleton Rim (Site04) and Nobile Rim 1 (Site06). The views can be linked so they share scale and viewing direction. One set of slope, roughness and footprint criteria applies to both, and an equal-footprint table explains the trade-offs. Selecting a terrain site also sets the planner's Site A or Site B, so the charts and mission windows follow. See the [acceptance report](docs/MILESTONE3_ACCEPTANCE.md).

## Validated Sun and Earth geometry (Milestone 4)

Sun and Earth directions come from JPL Horizons (DE441) in the Moon's body-fixed frame, including libration. They are checked against Horizons' own topocentric output at 9 sites and 40 times: the Sun agrees within 0.001° and the Earth within 0.006°. The 3D terrain view now draws Sun and Earth rays for the selected time, and Surface View reports Earth's phase, apparent size and distance. See the [acceptance report](docs/MILESTONE4_ACCEPTANCE.md).

## Terrain-aware sunlight and Earth line of sight (Milestone 5)

On the 5 m terrain sites, **3D Terrain** can show where the Sun and Earth are visible at the selected time, computed from the site's own terrain plus LOLA terrain out to 250 km. NASA's permanently shadowed regions are available as a static layer. Comparisons now separate full-disc, partial-disc and disc-weighted sunlight. Earth line of sight is geometric and is not a communication guarantee. See the [acceptance report](docs/MILESTONE5_ACCEPTANCE.md).

## Explainable mission-date recommendation (Milestone 6)

The **Mission Window Finder** separates hard requirements (sunlight, Earth visibility, darkness, blackout and, on the 5 m sites, a terrain footprint) from soft preferences (weights). Every ranked window shows its score breakdown. Sites without processed terrain are marked insufficient data rather than passing. The search and its results download as a reproducible JSON scenario. See the [acceptance report](docs/MILESTONE6_ACCEPTANCE.md).

## Immersive surface view (Milestone 7)

At Connecting Ridge, Shackleton Rim and Nobile Rim 1, **Surface View → 3D first person** puts you on NASA's 5 m terrain at the selected time:
- The Sun and Earth sit at their calculated bearings and true sizes, with Earth's phase.
- The sky is black, and shadows come from the horizon calculation.
- You can walk, look at the Sun or Earth, and see the horizon profile.

Other sites keep the 360° horizon panorama. VR is offered only where the browser supports it. See the [acceptance report](docs/MILESTONE7_ACCEPTANCE.md).

## Optional science layers (Milestone 8)

In **3D Terrain**, "Science layers" can drape two kinds of layer over the 5 m sites:
- NASA LRO Diviner polar products (model-derived annual temperatures and the depth at which water ice would be stable);
- KPLO ShadowCam's observed image of Shackleton's permanently shadowed interior, where it exists.

Each layer is labelled as a model or an observation, with units, coverage, source and caveats. Layers are context, never combined into a safety score. See the [acceptance report](docs/MILESTONE8_ACCEPTANCE.md).

## Development repository and milestone recovery

The complete current development project is now maintained in [Muxsinjon/new_luna](https://github.com/Muxsinjon/new_luna). The original `Muxsinjon/lunawindow` repository is retained unchanged. All application source, scientific assets, tests and pipeline scripts are at this repository's root; this is not just an archive repository.

Milestones 1–9 have [separate recovery files](milestones/README.md) and separate acceptance reports in `docs/`. The historical Milestone 1 backup ZIP and its checksum remain at the root; its old README is preserved in `docs/archive/NEW_LUNA_BACKUP_README.md`.

See [migration and development setup](docs/NEW_LUNA_MIGRATION.md) for audited contents and future Codex/Claude sessions. GitHub Pages deployment is manual-only; normal pushes do not deploy the site.
