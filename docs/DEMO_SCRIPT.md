# LunaWindow demo script (NASA Space Apps 2026: Lunar Landing Site Navigator)

Official limits, checked on 2026-11-15 in the [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/):
- **Video:** 30 seconds or less, **or** at most **7 slides** (including the title and intro slides).
- **Language:** English (a video in another language needs English subtitles).
- **Hosting:** an external host with a public link.
- **People:** no likeness of anyone under 18.
- **Branding:** no NASA logos, flags or mission identifiers.
- **AI-made imagery:** must carry a visible watermark.

All numbers below are **actual app outputs**. They were produced by `tests/e2e/journey_test.py` with every external request blocked, and the screenshots are in `docs/screenshots/demo/`.

## The scenario: two real polar regions and one recommendation

| | Site A: Shackleton Rim (PGDA Site04 DEM centre) | Site B: Nobile Rim 1 (PGDA Site06 DEM centre) |
|---|---|---|
| Terrain (NASA PGDA 5 m, 100 m footprint, ≤ 20° slope, ≤ 1 m roughness) | **0 %** of the footprint meets both limits (crater wall, median slope 32°) | **99.5 %** meets both limits |
| Best 14-day window starting in January 2027 (≥ 30 % sunlight, ≥ 30 % Earth) | none (fails the terrain requirement) | **2027-01-07 00:00 UTC**: Sun 64 %, Earth 68 %, longest darkness 60 h, longest blackout 107 h, preference score 0.749 (rank 1 of 242) |

These are illustrative user-chosen limits, not NASA standards. "Earth visible" means geometric line of sight, not a guaranteed radio link.

## 30-second video (one take, screen capture, English narration or subtitles)

| Time | Show | Say |
|---|---|---|
| 0:00 | Welcome screen | "We're [team], and this is LunaWindow, for the Lunar Landing Site Navigator challenge." |
| 0:03 | Explore and Compare with Site A Shackleton Rim and Site B Nobile Rim 1: Sun/Earth charts and the full / partial sunlight rows (`04-compare-sun-earth.png`) | "Pick two real south-polar sites. JPL Horizons geometry and LOLA terrain show when the Sun and Earth are actually above the horizon." |
| 0:09 | 3D Terrain, Compare A and B, hazard overlay, table says Shackleton fails and Nobile meets (`02-terrain-compare.png`) | "Same footprint and limits on NASA's 5 m terrain: Shackleton's crater wall fails, Nobile Rim 1 passes." |
| 0:15 | Mission Window Finder, "Why this window?" with the score breakdown (`05-finder-why.png`) | "The finder ranks windows. Top pick: Nobile Rim 1 from 7 January 2027, and it shows why." |
| 0:21 | Surface View, 3D first person, Look at the Sun, Next hour (`06-surface-first-person.png`) | "Stand there: the Sun and Earth move with time, hidden by real terrain." |
| 0:27 | About page, sources and limitations (`08-about-sources.png`) | "Every number cites its NASA source and limits. Open data, open code." |

The video is a screen recording, not AI-generated footage. If an AI voice or AI-edited footage is used, add a visible "AI-generated" watermark.

## 7-slide alternative

1. **Title:** LunaWindow (Explore. Compare. Plan. Experience.), team name and member names, challenge "Lunar Landing Site Navigator".
2. **The problem:** at the lunar south pole, sunlight and the Earth link come and go behind real terrain; where and when to land is a joint terrain and time question.
3. **The data:**
   - JPL Horizons (DE441) Sun and Earth geometry, 2023–2031;
   - LRO LOLA 240 m horizons;
   - NASA PGDA 5 m site DEMs, illumination maps and permanent-shadow map;
   - Diviner polar products; ShadowCam Shackleton mosaic.
4. **Compare two sites:** screenshot `02-terrain-compare.png` with the numbers from the table above.
5. **Find the window:** screenshot `05-finder-why.png`, top pick Nobile Rim 1 from 2027-01-07 with its reasons.
6. **Experience it:** screenshot `06-surface-first-person.png`, the Sun and Earth at their true sizes over real terrain.
7. **Trust and limits:**
   - validated against JPL Horizons (Sun 0.001°, Earth 0.006°);
   - horizons within 0.04° median of a native 5 m reference;
   - permanent shadows never lit;
   - not a NASA product or a landing-safety certification;
   - built with AI-assisted code (disclosed).

## Run the demo yourself

```bash
cd web
npm ci
npm run build
npx vite preview --port 4173
```

Then, in another shell from the repository root:

```bash
python tests/e2e/journey_test.py http://localhost:4173/
```

This writes the screenshots to `docs/screenshots/demo/`.
