# Lunar Landing Site Navigator: Team Plan

**NASA Space Apps Challenge 2026.** Hackathon: **Sat Nov 14 to Sun Nov 15, 2026.**
**Hard deadline:** press "Submit for Judging" before **Sun Nov 15, 11:59 p.m. local time of our Local Event.** Late submissions are not accepted.
Challenge page: https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/

---

## 1. What the challenge actually asks

Build an intuitive tool that lets **mission planners, educators and the public** compare lunar landing **sites and dates** quickly. For each site and date it should show where the **Sun and Earth** sit relative to the **horizon**, so users can judge:

- **Power:** solar elevation, how long the sunlight lasts, time left until sunset.
- **Communications:** whether Earth is above the horizon (direct-to-Earth link), and time left until Earthset.

The real pain point: missions slip (hardware or launch delays). Engineers then need to re-check **other dates at the same site** or **nearby sites on the same date** within minutes. Today that means juggling Quickmap, Moon Trek and JPL Horizons.

Optional ideas listed in the challenge statement: a curated list of sites (Apollo, CLPS, Artemis, other countries) plus custom coordinates; side-by-side comparison; date and season exploration; 2D, 3D or animated views; real LOLA topography for the horizon; libration; and support for different skill levels.

## 2. How we are judged

There are five criteria, each scored from 1 to 5, and they carry equal weight.

| Criterion | What earns a 5 | How we hit it |
|---|---|---|
| Impact | A significant problem; broad reach | Serves real CLPS/Artemis replanning *and* an education mode |
| Creativity | A new approach | Terrain-aware horizon + "slip analysis" date finder (see section 4) |
| Validity | Scientifically sound and usable | Real LOLA terrain + JPL ephemeris; validated against a real mission (Chandrayaan-3) |
| Relevance | NASA data is core, not decoration | LOLA DEM, PGDA illumination maps, Horizons, LROC Quickmap |
| Presentation | Clear, compelling story | Strong 30-second video plus a polished project page |

**Rules we must not break**

- Demo: a **video of 30 seconds or less** OR **7 slides or fewer** (counting title and intro slides). Going over the limit makes us ineligible for global judging.
- Everything must be in English. A video may use another spoken language only if it has English subtitles.
- Use at least one NASA dataset, and list *every* resource we use (code, images, libraries) in References.
- **AI (called "SI" this year) must not be used to come up with the solution idea itself.** It may help us write code. We must disclose where we used it. Any AI-generated image or video needs a visible watermark. We must not use NASA logos in generated content.
- All team members must be registered for the same Local Event (not waitlisted). The maximum team size is 6.
- No images or video of anyone under 18.
- The repo must be public, and every link must open in a private browser window without a login.

## 3. The key scientific insight (our edge)

At the south pole the Sun skims the horizon. JPL Horizons today, Nov 14, 2026, for a site at 84.79°S puts the Sun at **+0.2° to +1.0° elevation**. Horizons treats the Moon as a smooth sphere, so a ridge just 1° high would put that site in darkness.

**So the real answer = ephemeris (Sun/Earth az/el) + a terrain horizon mask built from LOLA topography.**
Many teams will stop at plotting Horizons numbers. Our core feature: **"Sun/Earth visible = elevation above the *local terrain* horizon"**, not above 0°.

Other physics to get right (judges care about Validity):
- The Sun's disc is about 0.53° wide, so model partial sunrise and sunset.
- Earth's disc is about 1.9° wide. Earth hangs almost fixed in the lunar sky but **wobbles a few degrees with libration** (a roughly monthly cycle). At the pole this alone switches direct-to-Earth comms on and off.
- A lunar day is about 29.5 Earth days. CLPS landers usually land soon after local sunrise to maximize operating time.
- Account for Moon curvature on distant terrain (a drop of about d²/2R, with R = 1737.4 km). At 50 km away the terrain sits about 0.7 km lower.
- There is no atmosphere, so no refraction correction is needed.
- Longitude conventions differ: Horizons uses east longitude 0–360°, while many lists use −180 to 180°. Normalize everything.

## 4. Product concept

**Working name:** "Lunar Landing Site Navigator". A web app with two modes:
- **Planner mode:** numbers, timelines, comparisons, export.
- **Explore mode:** visual, animated, plain-language explanations for educators and the public.

### MVP (must ship)
1. **Site picker.** A curated list (Apollo 11–17, the 9 Artemis III candidate regions, IM-1 Malapert A, IM-2 Mons Mouton, Blue Ghost 1, Chandrayaan-3, SLIM, Chang'e sites) plus custom lat/lon. Every coordinate must cite its source.
2. **Date and time picker plus a timeline scrubber** covering a lunar day.
3. **Horizon sky chart (the core visual).** A 360° panorama of the real terrain silhouette from LOLA, with the Sun's and Earth's paths drawn across it for the selected period, and a "now" marker.
4. **Metrics card.** Sun elevation; sunlit yes or no; **time to sunset**; Earth elevation; **time to Earthset**; % sunlit and % Earth-visible over the next N days; longest dark period.
5. **Compare mode.** 2–4 site/date scenarios side by side, plus a "swimlane" timeline: Sun bars in yellow, Earth bars in blue, both windows together in green.

### Creative features (pick 2–3 by priority once the MVP works)
1. **Slip Analyzer / Launch-window calendar (highest priority).** The user sets constraints, e.g. "land within 6 h after sunrise, at least 10 days of sun, Earth visible at least 50%". We return a **calendar heatmap of the best landing dates** for each site, and a "slip by 1 month → here's what you lose" diff. This speaks directly to the challenge's main pain point.
2. **"Move the pin 1 km" heatmap.** Overlay PGDA average-illumination and Earth-visibility maps on a south-pole map. Dragging the pin updates the numbers live, which shows *why small location changes matter*.
3. **3D shadow time-lapse.** A Three.js terrain mesh from the LOLA DEM, lit by the true Sun direction and animated across a lunar day: shadows sweep, and the Earth bobs on the horizon. This is the "wow" shot for the demo video.
4. **Power estimator.** Panel area, efficiency and orientation (vertical panels suit the low polar Sun) give Wh per day. Battery size tells whether the lander survives the dark gaps.
5. **Real-mission validation ("we predicted it").** Run the tool on Chandrayaan-3's site for Aug–Sep 2023 and show that the predicted local sunset matches the end of its surface mission. We can do the same for Apollo, which landed at a low Sun angle on purpose. This is a big Validity and storytelling point.
6. **Ground-station check.** Earth being above the horizon isn't enough. Show which DSN complex (Goldstone, Madrid, Canberra) can see the Moon at that moment.
7. **Shareable scenario links and CSV/PDF export** for engineering teams.

## 5. Data and tech stack

| Need | Source | Notes |
|---|---|---|
| Sun/Earth az/el at a site | **JPL Horizons API**: `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='elon,lat,alt_km'`, `QUANTITIES='4'` | **Verified working today.** Precompute hourly series per site; don't call it live from the browser. |
| Fast or bulk ephemeris (alternative) | SPICE via `spiceypy` + `de440.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_*.tf` (NAIF generic kernels) | Needed if custom sites or long date ranges get slow |
| Terrain for the horizon mask | LOLA polar DEMs (imbrium.mit.edu LOLA PDS node; PGDA south-pole 5 m/20 m site DEMs: pgda.gsfc.nasa.gov/products/78, /81). Global LOLA/SLDEM for non-polar sites | Precompute a 360-azimuth horizon mask per site, offline in Python |
| Long-term sunlight and Earth-visibility maps | PGDA Lunar Polar Illumination (Mazarico et al. 2011): `AVGVISIB_*`, `*_EARTH`, `LPSR_*` Cloud-Optimized GeoTIFFs at pgda.gsfc.nasa.gov/products/69 | Map overlay + validation of our own numbers |
| Visual reference | LROC Quickmap, Moon Trek | Screenshots or links; cite them |
| Partner data (bonus) | CSA Moon Exploration portal; optionally ISRO Chandrayaan-2 or JAXA Kaguya DEMs | 2026 partners are encouraged |

**Suggested stack** (adjust to the team's skills):
- **Offline pipeline (Python):** `numpy`, `rasterio`, `pyproj`, `requests`/`astroquery`, `spiceypy`. It outputs small JSON files: horizon masks plus Sun/Earth series per site.
- **Backend (optional, for custom coordinates):** FastAPI that samples the DEM and calls or caches Horizons or SPICE.
- **Frontend:** React + Vite. Plotly or D3 for the sky chart, swimlanes and heatmap. Three.js for 3D. Leaflet or OpenLayers with a polar-stereographic projection for the map.
- **Hosting:** GitHub Pages or Vercel (static) plus Render or Fly for the API if needed. The repo must be public.

## 6. Team roles (adjust to who we have, up to 6)

| Role | Owns |
|---|---|
| **Data/Science lead** | Horizons and SPICE pipeline, horizon-mask algorithm, physics checks, validation case |
| **Backend dev** | Data JSON format, FastAPI for custom sites, caching, deploy |
| **Frontend dev 1** | Site picker, sky chart, metrics card, compare mode |
| **Frontend dev 2 / 3D** | Map and heatmap overlay, Three.js time-lapse, Slip Analyzer UI |
| **Designer / UX** | Planner and Explore modes, visual language, accessibility |
| **Storyteller / PM** | Site list with sources, project page text, 30-second video, references, AI disclosure, deadline watch |

## 7. Timeline (H0 = when we start)

| When | Milestone |
|---|---|
| **H0–H2** | Lock the scope (this doc). Create the repo. Agree on the **data contract** (JSON schema for sites, horizon masks and time series). Assign owners. |
| **H2–H8** | Pipeline: Horizons series for 3 test sites. First horizon mask from the LOLA DEM. UI skeleton with mocked JSON. |
| **H8–H14** | Real data wired into the sky chart and metrics card. Compare mode v1. **Checkpoint: the MVP runs end to end.** |
| **H14–H20** | Full curated site list. Slip Analyzer. Map heatmap. Sleep in shifts. |
| **H20–H26** | 3D time-lapse, power estimator, validation case (Chandrayaan-3), Explore-mode copy. |
| **H26–H30** | **Feature freeze.** Bug fixes, deploy, test links in a private window. |
| **H30–H34** | Record the 30-second video. Write the project page (summary, description, NASA data, references, AI use). |
| **≥ 2 h before the deadline** | **Submit.** We can keep saving edits until the deadline, but the submit button must not wait for the last minute. |

## 8. 30-second video script (draft)

- **0–2 s:** "We're team ___ from ___."
- **2–5 s:** "Landing at the Moon's south pole means a Sun that skims the horizon."
- **5–10 s:** The title card, then 3D shadows sweeping across a crater rim.
- **10–20 s:** Pick a site, then the sky chart shows the Sun disappearing behind a real ridge. The countdown reads "sunset in 3 d 4 h". Compare two dates side by side, then the Slip Analyzer calendar lights up.
- **20–30 s:** "Built on LOLA and JPL Horizons, validated against Chandrayaan-3. From mission planners to classrooms, find your window on the Moon."

## 9. Risks and mitigations

- **DEM files are huge.** Crop around each site and precompute. Ship only small JSON files.
- **Horizons rate limits or outages.** Cache everything; fall back to SPICE.
- **Scope creep.** The MVP comes first. Creative features are strictly ordered, and the feature freeze is at H26.
- **Broken links during judging.** Make the deploy static where possible, test in a private window, and put a screen recording in the repo README.
- **Rules.** AI disclosure, watermarks on generated media, the 30-second limit, English, and references listed.
