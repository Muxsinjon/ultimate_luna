# Quality checklist (release gate)

Each ticked item was verified on 2026-11-14; the evidence follows each item.

- [x] `npm run build` succeeds with zero TypeScript errors and `npm run lint` reports zero errors. Prettier check clean. (Re-verified after the LunaWindow build.)
- [x] All unit tests pass (`npm test`: 61/61: physics, both visibility models, finder thresholds and invariants, URL state, edge cases, Horizons cross-check). The Playwright smoke tests (`tests/e2e/smoke_test.py`: 10/10) cover the welcome screen, two-site comparison, time controls, model toggle, Finder → Why this window → Surface View, mission summary, shared link, unsupported date, guided demo and the About page.
- [x] Zero console errors or warnings on every screen (asserted by both smoke tests and the screenshot script).
- [x] Lighthouse on the production build with gzip (reports in `docs/lighthouse/`):
  - Mobile: Explore & Compare 89–90, welcome 93, Finder 93.
  - Desktop: 95–96.
  - Accessibility 100 everywhere. Best Practices 96–100.
- [x] New screenshots in `docs/screenshots/after/` (welcome, compare, finder, surface, about at 1440 and 390), reviewed. A horizontal overflow in the Finder at 1440 was found and fixed.
- [x] Every curated site has a cited source (unit-tested). Three carry a visible "Needs verification" badge.
- [x] User-facing text is English (cspell pass; proper nouns and identifiers only).
- [x] No NASA logos. The OG image and welcome hero are drawn from our own LOLA horizon and computed Sun and Earth positions; no AI-generated images.
- [x] The deployed URL (https://muxsinjon.github.io/lunawindow/) and the repo (https://github.com/Muxsinjon/lunawindow) open without a login: both return HTTP 200 anonymously, and the 10 smoke flows pass against the live site in a fresh browser with no cookies. In the first minutes after the deploy, 2 of 3 runs had an intermittent failure in the Finder → Surface View flow; the 5 runs since all passed. The cause is not confirmed (most likely a slow first fetch of lazily loaded code from the CDN).
- [x] docs/AI_USAGE.md is up to date.

## Open items needing a team decision
1. ~~Publish~~ Done: public repo `Muxsinjon/lunawindow`, GitHub Pages via Actions.
2. ~~Git identity~~ Done: all commits authored as Muxsinjon (GitHub noreply address).
3. **Team section** in the README: names and roles.
4. **Three flagged coordinates** (SLIM, Chang'e 4, Shackleton floor): verify them in LROC QuickMap, or drop them.
5. **AI disclosure wording:** the Space Apps rule is that AI must not generate the solution idea. Confirm that `docs/AI_USAGE.md` describes how your team actually worked.
