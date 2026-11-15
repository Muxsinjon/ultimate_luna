# LunaWindow

**Explore. Compare. Plan. Experience.**

LunaWindow helps users explore lunar landing sites and find suitable mission periods by comparing sunlight, Earth visibility, and terrain. Built for the NASA Space Apps Challenge 2026 — Lunar Landing Site Navigator.

**[Open the website](https://muxsinjon.github.io/ultimate_luna/)**

## Team — Beyonders 1.0

- Eshmurodov Ozodbek
- Movutaliyev Muxsinjon

## Features

- **Explore & Compare:** choose locations on a rotating 3D Moon and compare their Sun and Earth visibility over time.
- **Mission Window Finder:** search dates against mission requirements and see why each candidate meets or fails them.
- **Surface View & 3D Terrain:** inspect supported lunar terrain, slopes, shadows, and the calculated positions of the Sun and Earth.
- **Mission Summary:** export results as JSON or a printable report, and share selected sites and dates through a link.

## NASA data

The project uses **JPL Horizons** for Sun and Earth positions, **LRO LOLA** for lunar elevation, and **NASA GSFC PGDA** products for detailed terrain and illumination context.

Analysis covers **2023-01-01 00:00 to 2031-12-31 18:00 UTC**, using hourly samples. Detailed 3D surface terrain is available at Connecting Ridge, Shackleton Rim, and Nobile Rim 1. Other locations use coarser terrain data and horizon panoramas.

LunaWindow supports preliminary mission planning; it does not certify landing safety.

[Data sources](docs/DATA_SOURCES.md) · [Methods, validation, and limitations](docs/MASTER_PROMPT_ACCEPTANCE.md)

## Technology

React, TypeScript, Vite, and Three.js for the website; Python for data processing. Hosted on GitHub Pages.

## Run locally

Requires Node.js 22 or later. From the repository root:

```bash
npm --prefix web ci
npm --prefix web run dev
```

Open the local URL shown in the terminal. To test or build:

```bash
npm --prefix web test
npm --prefix web run build
```

## Credits and license

Developed with AI assistance; [disclosure and development log](docs/AI_USAGE.md).

Code is available under the [MIT License](LICENSE). Scientific datasets retain their original source credits.
