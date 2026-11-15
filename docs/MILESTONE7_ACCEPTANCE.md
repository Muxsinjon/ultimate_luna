# Milestone 7: immersive surface view (desktop first, optional VR)

Date: 2026-11-15. Branch `milestone-7`, based on Milestone 6 (`bdbd5cd`).

## What existed and what is new

| Item | Status |
|---|---|
| 360° horizon panorama: true-angle LOLA horizon, Sun/Earth discs, Earth phase, look-at, field of view, keyboard look, shared time bar | **Verified existing**, kept as the default and as the fallback for every site |
| **3D first-person mode on the real 5 m terrain** (Surface View → "3D first person (5 m terrain)") | **Added** |
| Entry points that keep location and time | **Added:** the mode switch in Surface View, "Enter first-person view" in 3D Terrain, and URL state `fp=1`. Existing entries (Finder "Open in Surface View", Explore and Compare, demo) are kept. |
| WebXR | **Added** as progressive enhancement: shown only when `navigator.xr.isSessionSupported('immersive-vr')` is true |

## How the first-person view is built (no separate simulation)

**Terrain:**
- The same verified mesh as the 3D terrain view (`meshArrays`): the NASA PGDA 5 m DEM decimated to 20 m, on the curved lunar surface in the mesh frame (X east, Y up, Z south).
- The camera stands at a labelled eye height above the 20 m surface: 1.7 m by default, with 2 m (the planner observer), 10 m and 100 m as options.
- The camera uses the local east/north/up at its own position. Near the pole these rotate across the 8 km crop, so this matters.

**Beyond the crop:**
- The LOLA 240 m far-field horizon from Milestone 5 is drawn as a dark silhouette ring at 40 km. Nothing beyond it is invented.
- Sites with no 5 m coverage keep the 360° panorama, with an explicit message.

**Sun and Earth:**
- Milestone 4 directions (JPL Horizons, libration included).
- Drawn at 100 km at their true angular sizes: Sun 0.533°, Earth from the live distance.
- Earth is a sphere lit from the Sun direction, so its phase appears physically (the Earth–Moon parallax of about 0.15° is ignored).
- Depth testing against the terrain and silhouette hides them where terrain blocks them.

**Sky:** black, with no haze, refraction or clouds.

**Shading:**
- Lambert shading from the true Sun direction.
- Multiplied by the Milestone 5 computed sunlit fraction every 80 m (the default "Computed sunlight and shadow" overlay). This is not a shadow map, so shadow detail matches the analysis scale.
- A 5 % fill light keeps shadowed ground faintly visible. It is labelled as a display aid, not earthshine.

**Overlays:**
- computed sunlight and shadow;
- hazard spots (10°, 0.3 m, illustrative, Milestone 2 layers);
- plain terrain;
- a Sun/Earth az/el, angular size and phase readout;
- computed visibility at the spot vs the planner value;
- a 360° horizon profile (5 m-site horizon at the spot, planner 240 m horizon, Sun, Earth, heading).

**Controls:**
- drag to look;
- wheel or select to zoom (field of view 10–100°);
- arrow keys to look;
- W A S D to walk 5 m (Shift for 50 m), staying on the terrain and 200 m inside the crop edge;
- look at Sun / Earth / north;
- compass heading readout;
- return to site;
- back to the panorama, or to the 3D terrain map;
- the shared time slider.

**WebXR:**
- Look-around only, with no artificial locomotion (to limit motion discomfort).
- The rig is aligned to local east/up/north, and an animation loop runs only during a session.
- Where VR is unsupported, the app says so and the desktop view is the full experience.

## Verification

**1. Geometry** (`firstPerson.test.ts`):
- The camera stands exactly the eye height above the source grid at the crop origin, and returns null outside the crop.
- Look vectors round-trip; the local basis is orthonormal.
- Sun and Earth directions in the view equal the Milestone 4 az/el at the camera within 1e-6°, at the crop centre and 4 km off-centre near the pole.
- Walking stays on the surface.

**2. Rendered terrain vs the accepted 360° horizon.** At each site location, the horizon the first-person view shows (20 m mesh within the crop plus the 240 m silhouette beyond) was compared with the planner mask, in degrees:

| Site | Median abs | p95 abs | Max | Mean (view − planner) |
|---|---|---|---|---|
| Connecting Ridge (Site01) | 0.19 | 1.76 | 2.13 | −0.43 |
| Shackleton Rim (Site04) | 0.48 | 1.34 | 1.44 | +0.59 |
| Nobile Rim 1 (Site06) | 0.62 | 3.34 | 3.48 | +1.19 |

The differences come from the near-field 5 m relief, which the 240 m planner terrain smooths. They also come from the observer elevation: at Nobile, the 5 m surface is 21 m below the 240 m DEM elevation the planner uses, which raises the horizon. Milestone 5 measured the 20 m-mesh horizon against a native 5 m reference: median 0.01–0.04°, p95 0.28–0.67°.

**3. Rendered pixels vs the calculation** (`tests/e2e/surface3d_test.py`, software WebGL):
- **Shackleton crater wall, 2027-01-05 12:00 UTC:** the Sun is 1.16° above the smooth horizon, but the calculation gives 0 % visible. The rendered pixel at the Sun's projected position is terrain, not Sun.
- **Connecting Ridge, 2026-11-22 01:00 UTC:** the calculation gives 100 %, and the Sun's colour is rendered at its projected pixel.
- **Bearings:** the readout matches the Horizons fixture for Connecting Ridge (Sun within 0.01°, Earth within 0.02°; the observer stands 1.7 m above the mesh rather than on the sphere).
- **Look at Earth:** centres the Earth disc on screen within 2 px.

**4. Paths exercised:**
- a date change (Next hour moves the Sun);
- walking;
- unsupported WebXR (headless Chromium reports none, and the message says so);
- the coverage fallback (Apollo 11: 3D disabled, panorama shown);
- the load-error path (missing horizon inputs give a visible alert);
- a 390 px mobile layout with no overflow;
- a clean console.

**5. Regression:**
- 123 unit tests and 28 Python tests pass.
- The smoke (original panorama Surface View included), terrain, hazard, astronomy, lighting and finder e2e suites pass.
- `tsc`, ESLint, Prettier and the build are clean.

The terrain compare e2e once reported a cancelled 10 MB layer download while all suites ran back to back on the software renderer. It passed twice when rerun alone. Milestone 7 does not change that code path; the race is recorded as a known intermittent test issue.

Reference screenshots are in `pipeline/out/surface3d-screenshots/` (Earth look-at, Sun hidden, Sun visible, mobile). They are regenerated by the e2e run and not committed.

## Realism limits (also shown in the view)

- **Mesh:** a 20 m mesh of a DEM that is about 90 % interpolated. Features below about 20–40 m, boulders and small craters are absent. Only a 240 m silhouette is drawn beyond the 8 km crop.
- **Shadows:** computed every 80 m by the horizon method. Brightness is not photometric. There is no earthshine, multiple scattering or lander lighting.
- **Imagery:** none. LROC WAC registration is unverified, so it stays off. NAC, QuickMap and ShadowCam imagery are not integrated.
- **Not modelled:** dust, regolith physics or real-time surface interaction.
- **VR:** implemented against the WebXR API, but only the unsupported path could be tested here (no headset available). It is look-around only.
- **Performance:** about 160 k vertices per site; the first-person view renders on demand (no continuous loop on desktop).
