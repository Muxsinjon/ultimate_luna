# Complete project migration to Muxsinjon/new_luna

The working application, processing scripts, tests, fixtures, fonts/licenses, scientific assets and documentation are at the root. Milestone 1 `aeb54a6` and final Milestone 2 `ee376b6` remain ancestors of the migration commit. No Milestone 3 experiments or uncommitted project changes were present at migration start.

The destination was not empty: its `main` had two backup-only commits (`ce41b96`, `b2fe131`). A normal unrelated-histories merge preserves both that history and the full application history. The backup ZIP/checksum remain at their original root paths. Its README is preserved under `docs/archive/`; the main README describes the full project. No force-push or history deletion is used.

The existing `origin` remains `https://github.com/Muxsinjon/lunawindow.git`. A separate `new-luna` remote points to `https://github.com/Muxsinjon/new_luna.git`. Only `new-luna/main` is the migration push destination. The original source main was observed at `f82b2931a589a451c7c6d1de3df8005a7f3128df`; verify it remains unchanged after migration.

## Scope and sensitive-data audit

All 350 reachable historical blobs available at inspection were examined by type. Text was scanned for GitHub/Slack/AWS tokens, private keys, credential assignments and credential-bearing URLs. Historical `.env` content was separately reviewed: `web/.env` contains only `VITE_SITE_URL=./`, a public relative build URL, not a secret. No findings remain. The historical backup ZIP passed CRC/member/config checks and contains no authentication-storage directories. This is a practical pattern/manual environment-file audit, not a proof against every possible encoded secret. Audit receipt: `docs/data/NEW_LUNA_HISTORY_AUDIT.json`.

No private credentials, task authentication folders, caches, node_modules, Python virtual environments, raw NASA downloads, generated scientific GeoTIFFs or temporary screenshots are included. Existing tracked screenshots and validation evidence are retained. Runtime assets include the original ephemeris/regional grids, Site01 elevation/RMS/imagery, native-resolution slope/roughness screening fields, and local fonts/licenses. Cached original rasters remain excluded but can be downloaded reproducibly.

Separate milestone patch files are in `milestones/`, with separate acceptance reports in `docs/MILESTONE1_ACCEPTANCE.md` and `docs/MILESTONE2_ACCEPTANCE.md`. Patches are recovery material; all corresponding code and assets are already integrated at the root.

## No automatic deployment

The inherited Pages workflow previously deployed on main pushes. Its push trigger is removed in the destination migration tree; `workflow_dispatch` remains for a future explicit user-authorized deployment. Repository visibility/settings are not changed. CI remains a test/build workflow and does not deploy.

## Resume in Codex or Claude

Select or clone `Muxsinjon/new_luna`, branch `main`, and read `CLAUDE.md`, `docs/PROJECT_STATUS.md`, both milestone acceptance files, `docs/DATA_SOURCES.md` and `docs/SITE01_SLOPE_DISCREPANCY.md` before editing. Do not apply milestone recovery patches on top of main. Do not start Milestone 3 without a new instruction.

```sh
git clone https://github.com/Muxsinjon/new_luna.git
cd new_luna/web
npm ci
npm test
npm run lint
npm run format:check
npm run build
npm run dev
```

For Python scientific work, create `pipeline/.venv` and install `pipeline/requirements-terrain.txt`. `python pipeline/hazard_site01.py` reuses or downloads pinned native inputs and writes ignored full-precision scientific GeoTIFFs required by the hazard browser reference tests. See `docs/MILESTONE2_ACCEPTANCE.md` for exact test/browser commands and uncertainty limits. Windows virtual-environment commands use `.venv\Scripts` instead of `.venv/bin`.

New clones conventionally call the new repository `origin`; the old `origin` configuration described above applies only to the preserved original local checkout. If adding the old source as an extra remote later, do not push to it accidentally. No milestone scientific results are changed by this migration.

## Migration verification

Before committing: 73 JavaScript tests and 14 Python scientific tests passed, as did lint, formatting and production build. Python used the existing `/workspace/.venvs/lunawindow` environment; bare system Python lacks Rasterio. The existing Vite chunk-size advisory remains. The application source, scientific calculations, tests and processed runtime assets are byte-identical to `ee376b6`; only documentation, separate recovery files, retained legacy backup files and the manual-only Pages trigger differ. Recovery patches preserve original patch whitespace; the remaining staged files pass `git diff --check`.
