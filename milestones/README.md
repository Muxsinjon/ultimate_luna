# Separate milestone recovery files

The complete working project is at the repository root. These files preserve the milestones separately; they are not substitutes for the working tree.

- `MILESTONE_1.patch`: commits after original baseline `f82b293` through `aeb54a6` (3D terrain and final verification).
- `MILESTONE_2.patch`: commits after `aeb54a6` through `ee376b6` (hazard analysis and slope-discrepancy investigation).
- `MILESTONE_3.patch`: the Milestone 3 commit after `0eabd44` (multi-site terrain and dual 3D comparison), with binary terrain layers.
- `MILESTONE_4.patch`: the Milestone 4 commit after `3b43df0` (astronomy audit, validation and gap fixes).
- `MILESTONE_5.patch`: the Milestone 5 commit after `09f42c0` (terrain-aware sunlight and Earth line of sight), with binary illumination inputs.
- `MILESTONE_6.patch`: the Milestone 6 commit after `ac22e2f` (explainable mission-date recommendation).
- `MILESTONE_7.patch`: the Milestone 7 commit after `bdbd5cd` (immersive surface view, optional WebXR).
- `MILESTONE_8.patch`: the Milestone 8 commit after `cd5afab` (optional science overlays and a URL-hash race fix), with binary layers.
- `MILESTONE_9.patch`: the Milestone 9 commit after `1c0017d` (release gate).
- Separate acceptance reports: `docs/MILESTONE1_ACCEPTANCE.md` to `docs/MILESTONE9_ACCEPTANCE.md`.

Use `git am` on the corresponding base only when recovering a missing milestone. Do not apply these patches to this final repository: their commits are already ancestors of main. The original complete Milestone 1 ZIP remains at the root for existing download links.
