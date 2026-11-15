# LunaWindow prompt vs current build (gap checklist)

This compares the master prompt (`Prompt.txt`, "LunaWindow") with branch `pro-upgrade` as of 2026-11-14.

**Legend:** ✅ done · ⚠️ partial or done differently · ❌ missing · ⚡ conflicts with an earlier rule (needs a team decision)

**Summary:** the science engine, the data pipeline, validation and the polish are well ahead of the prompt. Our terrain-aware horizon is the prompt's P3 stretch goal, and it's already built. What's missing is mostly the prompt's **product structure**:
- the **Site A vs Site B** dashboard,
- a multi-site **Mission Window Finder** with the four result categories and **"Why this window?"**,
- a dedicated **Surface View** workspace,
- the **welcome screen and guided demo**,
- the **Mission Summary export**,
- the **LunaWindow branding**.

---

## Status after the LunaWindow build (2026-11-14, branch `pro-upgrade`)

Team decision on C1: **keep terrain-aware as the main model and add the geometric 0° model as a labelled toggle.** Done.

| # | Gap from the list below | Status |
|---|---|---|
| C1 | Geometric vs terrain model | ✅ A header toggle; the model label sits next to every result block; both feed every workspace |
| C2 | No sub-hour claims | ✅ Hourly half-open sampling; rise and set shown as "between 03:00 and 04:00 UTC" |
| C3 | Black sky | ✅ Black in both themes; Surface View, welcome hero and OG image |
| C4 | LunaWindow brand | ✅ Title, header, tagline, welcome, README, OG image, summary |
| C5 | Cyan accent | ✅ UI accent (tabs, focus, selection); Sun, Earth and both keep their semantic colours |
| C6 | Tailwind and Recharts | ➖ Not used (hand-written CSS tokens and SVG charts); the prompt says "preferred", not required |
| 1 | Quick fixes: 1 and 3 d durations, prev/next, speed, numeric azimuth, supported-range message | ✅ |
| 2 | Site A / Site B shared state, URL, A/B map pins | ✅ |
| 3 | Sun and Earth elevation vs time for A and B, with 0° line, tooltips and synced cursor | ✅ |
| 4 | Compare metrics: blackout, interruptions, longest intervals, only-Sun/only-Earth/neither, Highlight differences, trade-offs | ✅ |
| 5 | Mission Window Finder: all requirements, all sites, 4 categories, ranking, sortable list, overview grid | ✅ |
| 6 | Why this window? plus jump to the critical interruption | ✅ |
| 7 | Surface View workspace: drag pan, Look at Sun/Earth, compass, overview, readout, reasons | ✅ |
| 8 | Workspace actions (Finder, Surface, Reset, Summary) | ✅ |
| 9 | Mission Summary: print/PDF and JSON | ✅ |
| 10 | Welcome screen plus guided demo (10 steps, live numbers; a blackout limit of 48 → 12 h changes 37 → 0 feasible starts) | ✅ |
| 11 | Rebrand | ✅ |
| 12 | Tests: invariants, thresholds, always/never visible, no window, insufficient data, start in a blackout, end of data | ✅ 61 unit tests, 10 end-to-end flows |
| 13 | Deploy and check in a private window | ✅ Live at https://muxsinjon.github.io/lunawindow/ (repo `Muxsinjon/lunawindow`); smoke tests pass against the live site |

**Still open:**
- Map zoom and pan: only three fixed extents (80°, 85°, 88° S).
- 3D terrain and WebXR: the prompt's optional stretch goal.
- Three coordinates flagged "Needs verification".
- The data form differs from the prompt's per-site observation records (§7.1). We ship validated sub-solar and sub-Earth points instead and compute az/el in the browser; this is documented in the README and the About page.

---

## Conflicts to decide first ⚡
| # | Prompt says | Build does | Recommendation |
|---|---|---|---|
| C1 | Visibility = disc **centre above the geometric horizon (0°)**; terrain-aware only as a separately labelled P3 extra (§7.3, §7.4) | Visibility = **upper limb above the LOLA terrain horizon** (the rule in our CLAUDE.md) | Keep terrain-aware as the main model, because it's the stronger science and the Validity edge. Add the **geometric 0° model as a second, labelled series and toggle**, so both are shown and labelled as the prompt asks. |
| C2 | "Do not claim sub-hour timing accuracy from hourly samples" (§7.3) | Countdowns show minutes ("2 h 51 min at 03:30 UTC"), interpolated between hourly samples | Round displayed event times to the hour (or show "≈"), and state ±1 h in tooltips. Keep minute precision internally. |
| C3 | Sky must look **essentially black**; no Earth-like blue sky (§6.1) | The panorama sky tints blue-grey (`--c-sky-day`) when the Sun is up | Make the sky black in both states, and show the Sun's state another way. Quick fix. |
| C4 | Name **LunaWindow**, tagline "Explore. Compare. Plan. Experience." | "Lunar Landing Site Navigator" | Rebrand: title, header, README, OG image, favicon text. |
| C5 | Visual identity: deep navy, **electric blue/cyan accents** | "Terminator" slate theme, with amber/blue/green semantics and no cyan | Optional. The prompt leaves room ("such as"). Could add a cyan UI accent for selection and focus only. |
| C6 | Stack: Tailwind + Recharts preferred; Vercel/Netlify | Hand-written CSS tokens and SVG charts; GitHub Pages workflow | No change needed ("preferred", not required). Deploying to Vercel or Netlify is equally easy. |

---

## §2 Platform structure and navigation
- ⚠️ **Three connected workspaces.** We have Explore a site / Compare / Landing calendar / Data and methods. The prompt wants **Explore & Compare / Mission Window Finder / Surface View / About**.
- ⚠️ **Shared state across workspaces.** Site, start, cursor, window, mode and time zone are shared and in the URL. But there's no **Site A + Site B** pair, and the Compare scenarios and calendar constraints are local to their own view.
- ✅ Persistent navigation with the active workspace highlighted; responsive layout.
- ❌ The workspace names don't match the prompt's.

## §3 Welcome screen and onboarding
- ❌ Landing screen with the heading "LunaWindow — Find the Right Place and Time to Land on the Moon" and the supporting text.
- ❌ Option A "Explore Landing Sites" and Option B "Plan a Lunar Mission".
- ❌ **Try Guided Demo** button. We only have a dismissible 3-step hint.
- ✅ No registration or setup.

## §4 Explore & Compare
**4.1 Map**
- ⚠️ We have a south-pole map with LOLA hillshade and PGDA overlays (credited), and dropdown and pin selection. **Missing:** a Site A / Site B colour distinction, and zoom/pan (only three fixed extents).
- ⚠️ Site coordinates are cited, but 3 of 17 are flagged "Needs verification". The prompt: "do not invent… verified".
- ✅ Arbitrary locations are allowed only because the terrain calculation supports them (labelled as coarser terrain).

**4.2 Date and time controls**
- ✅ Start date, time slider, play/pause.
- ⚠️ Duration options are 7/14/30/60/90 days. The prompt suggests **1, 3, 7, 14**, so 1 and 3 are missing.
- ⚠️ Previous/next timestamp works by keyboard only (←/→). There are **no visible step buttons**; the ±1 d buttons move the window start, not the cursor.
- ❌ Playback-speed selector.
- ❌ **An explicit message for unsupported dates.** Dates are silently clamped to 2023–2031.

**4.3 Per-site values**
- ✅ Sun and Earth elevation. ⚠️ **Azimuth is not shown as a number**; it's only in the chart's hover readout and screen-reader text.
- ⚡ "Above or below the **geometric** horizon" is not shown. We show the terrain margin instead (see C1).
- ⚠️ Combined states: lanes exist for Sun, Earth and Both. **"Only Sun", "only Earth" and "neither" are not explicit.**

**4.4 Charts**
- ❌ **Chart A: Sun elevation vs time for Site A and Site B.**
- ❌ **Chart B: Earth elevation vs time for both sites.**
  - Today the explorer shows one site's height above terrain. Compare shows lanes only, not elevation curves.
- ⚠️ A 0° reference line and a synced cursor exist on the single-site chart. **Hover tooltips on the curves are missing.**

**4.5 Visibility timeline**
- ✅ Sun, Earth and Both lanes; hover shows start, end and duration; clicking sets the cursor.
- ⚠️ The site name is missing from the interval tooltip, and clicking sets the time at the click point, not the interval start.

**4.6 Comparison dashboard**
- ✅ Sun %, Earth %, simultaneous %, longest darkness, best value highlighted, deltas.
- ⚠️ The longest Earth blackout is in the explorer tiles but **not in Compare**.
- ❌ Number of communication interruptions.
- ❌ Longest continuous Sun interval and longest continuous Earth interval.
- ❌ **"Highlight differences"** (intervals where A has Sun and B doesn't, and so on).
- ❌ A written **trade-off explanation** ("A has more sun, B has better link").

**4.7 Actions**
- ⚠️ "Add to comparison" exists.
- ❌ Open in Mission Window Finder, Inspect in Surface View, Reset comparison, Generate Mission Summary.

## §5 Mission Window Finder (our "Landing calendar")
**5.1 Configuration**
- ✅ Mission duration and minimum Earth % are there.
- ⚠️ Earliest start = window start, and latest start = "look ahead N months". Neither is an explicit date pair.
- ❌ Minimum **sunlight %**. We use "uninterrupted sun after landing" instead.
- ❌ **Maximum uninterrupted darkness** (hours).
- ❌ **Maximum communication blackout** (hours).
- ❌ Optional minimum simultaneous %.
- ❌ The "illustrative defaults, not NASA standards" label.

**5.2 Search**
- ⚠️ It evaluates every day for **one site**. ❌ It should search **across all supported sites**.
- ✅ It only evaluates starts whose full mission fits inside the data.

**5.3 Categories**
- ❌ Meets / Partially meets / Does not meet / Insufficient data. Today it's a binary viable or not viable.
- ❌ A documented ranking that puts hard requirements first.

**5.4 Results**
- ⚠️ A calendar heatmap exists.
- ❌ A results **list** with site, start, end, Sun %, Earth %, max darkness, max blackout and status.
- ❌ Sorting and filtering.

**5.5 Why this window?**
- ❌ The **signature feature**: a panel that says which requirements passed or failed, using real numbers ("blackout 16 h, allowed 12 h"), plus the best intervals, the critical interruptions, a comparison with alternatives, and the assumptions.

**5.6 Actions from results**
- ✅ Open in explorer (clicking a day).
- ❌ Open in Surface View, jump to the most critical interruption, recalculate in place, Mission Summary.

## §6 Surface View
- ⚠️ We have a 2D 360° panorama with the **real LOLA terrain horizon** (the prompt's P3 item), the Sun and Earth at their calculated az/el, compass labels, the UTC time, and occluded bodies drawn faded. But it's embedded in the explorer, **not a separate astronaut-view workspace**.
- ⚡ The sky isn't black when the Sun is up (C3).
- ❌ Panning the view horizontally and vertically (mouse or touch), and an observer orientation indicator.
- ❌ **Look at Sun** / **Look at Earth** buttons.
- ⚠️ The current az/el is visible on hover and in Explore text, but not as a fixed readout.
- ✅ The scientific reason for visibility is shown in Explore mode text.
- ❌ Playback speed (shared with §4.2).
- ❌ Optional 3D and WebXR (stretch; correctly not started).

## §7 Shared data engine
- ✅ NASA/JPL Horizons is the source. Observer geometry was checked against Horizons' topocentric az/el (worst 0.0034°). The longitude convention is documented and normalized.
- ⚠️ The data form differs. The prompt wants per-site observation records (`siteId, utc, sunAz, sunEl, earthAz, earthEl, source`). We ship sub-solar and sub-Earth points and compute az/el in the browser for any site. It's equivalent and validated, but the README should explain why.
- ✅ One engine is shared by every view. Precomputed. No runtime API calls.
- ✅ The supported date range is restricted (2023–2031). ❌ But it isn't **stated in the UI** near the date picker.
- ⚡ The visibility definitions differ (C1). ⚡ Sub-hour claims (C2).
- ⚠️ We count durations with interpolated edges, not sample counts on half-open intervals. That needs documenting if we keep it.
- ⚠️ **Limitations list.** We cover terrain resolution, link ≠ visibility, the power model and coordinates. **Missing explicit items:** battery capacity, landing safety, surface stability, thermal survivability, radiation, water-ice access.
- ⚠️ The terrain-aware label ("LOLA 240 m") sits in tooltips and on the data page. ❌ The prompt wants it **next to the results**.

## §8 Shared state (`MissionState`)
- ⚠️ We have `site`, `start`, `cursor`, `windowDays`, `tab`, `mode` and `tz`. ❌ We're missing `siteAId`/`siteBId`, `searchStartUTC`/`searchEndUTC` and a shared `missionRequirements` object.

## §9 Mission Summary and export
- ❌ The summary panel (sites, coordinates, dates, requirements, metrics, pass/fail, interruptions, explanation, sources, limitations).
- ❌ Print/PDF or JSON export.

## §10 Guided demonstration
- ❌ The step-by-step demo (two sites → map → period → compare → unfavourable moment → Surface View → Finder → change a requirement → summary).
- ✅ We already have a real scenario for it: Nobile Rim 2, where the Sun sets 6.4° above a flat horizon on 2026-11-22.

## §11 Visual design and interaction
- ✅ Professional, restrained, readable; colour plus patterns and labels; units everywhere; loading and error states; tooltips explain the terms; works on desktop and mobile.
- ⚠️ The prompt's layout calls for a **right-hand metrics panel**. Ours has metrics under the charts.
- ⚡ The palette differs (C5).

## §12 Technical architecture
- ✅ React, TypeScript, Vite; Python and requests pipeline; static hosting; Git; separated data, physics, state and UI.
- ⚠️ No Tailwind or Recharts (C6). ❌ **Not deployed yet** (needs a public repo).

## §13 Priorities, scored against the prompt
- **P0:**
  - ✅ 1, 3, 4, 5, 8, 10.
  - ⚠️ 2: we have 17 sites, but no Site A/B pair.
  - ⚠️ 6 and 7: we have elevation-above-terrain curves, not Sun and Earth elevation timelines for two sites.
  - ⚠️ 9: side-by-side exists in Compare, but without the two-site charts.
- **P1:**
  - ⚠️ 1–2: requirements and search are partial and single-site.
  - ❌ 3–4: candidate list with pass/fail explanations.
  - ✅ 5–6: darkness and blackout metrics; simultaneous timeline.
  - ⚠️ 7: Surface View is embedded rather than its own workspace.
  - ❌ 8: guided demo.
- **P2:**
  - ✅ 1, 2, 5.
  - ❌ 3: Mission Summary export.
  - ❌ 4: advanced explanations.
  - ⚠️ 6: observer controls.
- **P3:**
  - ✅ 2: terrain-aware horizon.
  - ⚠️ 3: power estimate only, no battery model.
  - ❌ 1, 4, 5 (terrain mesh, 3D, WebXR), correctly deferred.

## §14 Error handling
- ✅ Data load failure with retry, a per-view error boundary, missing data never treated as visible, and loading states.
- ❌ An explicit "unsupported date" message (dates are clamped silently).
- ⚠️ "No candidate meets requirements" shows "None in range" without the suggested-relaxation wording.
- ❌ An "insufficient data" status for windows that would run past 2031 (they're just omitted today).

## §15 Validation and testing
- ✅ 1–4: coordinates (3 flagged), Horizons geometry, parsed angles, time sync (tested via URL state and smoke tests).
- ⚠️ 5–7: not asserted as tests. We need **property tests** that percentages are 0–100 %, joint ≤ each, and durations ≤ the mission.
- ❌ 8: finder thresholds tested.
- ✅ 9–12.
- ❌ 13: deployed site tested from another computer.
- **Edge cases:**
  - ✅ never visible (Shackleton floor); intermittent; blackout at the window edge (`longestGap`).
  - ❌ always visible, no qualifying windows, incomplete data.

## §16 Definition of done
- **MVP 1–10:** ✅ except 2 ⚠️ (two sites at once only in Compare, with no A/B charts) and 6 ⚠️ (same).
- **Competitive 11–16:**
  - 11 ⚠️ partial requirements.
  - 12 ⚠️ single-site search.
  - 13 ❌ no categories.
  - 14 ❌ no evidence-based explanations.
  - 15 ✅ (panorama).
  - 16 ❌ no summary.

## §17 Deliverables
- ✅ Working app, modular code, reproducible pipeline, documented NASA sources, README, method and limitations documents.
- ⚠️ Supported sites and date range are documented in the README and the Data page. ❌ They're not shown next to the date picker.
- ❌ A written guided-demo scenario. ❌ A deployed URL.

---

## What to build, in order (estimates for one developer)
| # | Gap | Prompt § | Est. |
|---|---|---|---|
| 1 | Quick conflict fixes: black sky (C3), hourly-rounded event times with ±1 h note (C2), supported-range message on the date picker, 1- and 3-day durations, visible prev/next timestamp buttons, playback-speed selector, numeric azimuths | 4.2, 4.3, 6.1, 7.3, 14 | 1.5 h |
| 2 | **Site A / Site B model** in shared state and the URL; A/B colours on the map | 4.1, 8 | 1.5 h |
| 3 | **Sun-elevation and Earth-elevation charts for A and B**: 0° line, terrain-horizon line, hover tooltips, synced cursor; **geometric vs terrain toggle** (C1) | 4.4, 7.3 | 3 h |
| 4 | Comparison additions: blackout, interruption count, longest Sun and Earth intervals, "only Sun / only Earth / neither", **Highlight differences**, trade-off sentences | 4.3, 4.6 | 2.5 h |
| 5 | **Mission Window Finder** v2: all requirements (min Sun %, min Earth %, min joint %, max dark h, max blackout h, earliest/latest start), **all sites**, the 4 categories, hard-constraints-first ranking, a sortable results list | 5.1–5.4 | 4 h |
| 6 | **"Why this window?"** panel from computed metrics, with jump-to-critical-interruption | 5.5, 5.6 | 2 h |
| 7 | **Surface View workspace**: pan/drag view, Look at Sun and Look at Earth, orientation indicator, fixed az/el readout, reuses the terrain panorama | 6 | 3 h |
| 8 | Workspace actions wired up (open in Finder or Surface View, Reset, Summary) | 4.7, 5.6 | 1 h |
| 9 | **Mission Summary** with printable HTML/PDF and JSON export | 9 | 2 h |
| 10 | **Welcome screen** (Option A/B) plus a **guided demo** using the real Nobile Rim 2 scenario | 3, 10 | 2.5 h |
| 11 | **LunaWindow rebrand** (title, header, README, OG image) | 1 | 0.5 h |
| 12 | Tests: percentage and duration invariants, finder thresholds, always-visible, no-window and insufficient-data cases; expanded limitations list | 7.4, 15 | 1.5 h |
| 13 | Deploy and check in a private window (needs the public repo) | 15, 17 | 0.5 h |

**Total:** about 25 h of focused work. With two developers in parallel, roughly 12–14 h.
- **Developer 1 (data/logic):** items 2, 4, 5, 6, 12.
- **Developer 2 (UI):** items 1, 3, 7, 9, 10, 11.

**If time runs short, the minimum to match the prompt's MVP plus its "competitive" core is items 1, 2, 3, 5, 6, 11 and 13: about 15 h.**
