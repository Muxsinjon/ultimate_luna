# Ultimate Luna review website

The owner created the public repository and granted the connected GitHub app access. The improved project is prepared for publication to `main`; the Actions deployment status is the source of truth for website availability.

Repository: https://github.com/Muxsinjon/ultimate_luna
Website: https://muxsinjon.github.io/ultimate_luna/

This is the user-authorized publication of the local improvements based on `new_luna` main `42bcf0c`, including improvement commit `5bcc769`. The original repository is not modified.

## Deploy a reviewed revision

GitHub Pages uses **GitHub Actions** as its source. Open the repository's **Actions → Deploy to GitHub Pages → Run workflow**, choosing `main`.

The workflow installs locked dependencies with Node 22, runs the unit tests, builds the static app, uploads `web/dist`, then deploys it to Pages. Relative asset paths and hash-based navigation support the `/ultimate_luna/` project path. `VITE_SITE_URL` supplies the Pages URL for social preview metadata. Deployments are manual; a push alone does not publish the site.

The app serves its existing NASA/JPL datasets locally from the Pages site. It does not need a backend API key. High-resolution terrain is limited to the three verified crops; other lunar locations support the planner and horizon panorama.

## Check the site

1. Open Explore & Compare and rotate the Moon; select a point and use it as Site A/B.
2. Choose Connecting Ridge, then View from the surface, to inspect real 3D ground.
3. Use Show all controls for detailed charts and terrain screening.
4. Find a mission window and export its summary.

For a local production preview: `cd web`, `npm ci`, `npm run build`, then `npm run preview`.
