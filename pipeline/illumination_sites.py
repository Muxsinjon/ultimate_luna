"""Milestone 5: time-dependent terrain shadow inputs and independent checks for the processed 5 m terrain sites.

For each site in web/public/data/terrain/index.json this writes <site>/illumination/:
  far.json + far_el.i16 + far_d.u16   far-field horizon outside the 8 x 8 km crop, on a 21 x 21 grid (400 m) x 720
                                      azimuths (0.5 deg): elevation angle (0.01 deg) and distance of the limiting terrain
                                      (0.1 km). Terrain: the planner's LOLA LDEM_75S_240M, great-circle rays to 250 km,
                                      observer 2 m above the 20 m mesh surface, exact spherical geometry.
  psr.u8                              NASA PGDA product 90 LPSR_80S_20MPP_ADJ (permanently shadowed regions, 20 m),
                                      sampled at the 401 x 401 mesh vertices (pixel containing the vertex): 1 PSR,
                                      0 not PSR, 255 no data. Static context, not a date-specific prediction.

Independent checks (no browser code involved):
  * reference horizons from the NATIVE 5 m PGDA DEM (10 m steps, whole native raster) + 240 m DEM beyond, at random
    mesh vertices and azimuths -> web/src/lib/__fixtures__/shadow_reference.json (the Vitest suite compares the
    browser shadow algorithm, which uses the 20 m mesh + far-field grid, against it);
  * long-term sunlit / Earth-visible fractions over the hourly 2023-2031 Horizons series at a 9 x 9 grid per crop,
    compared with NASA PGDA product 69 average visibility (AVGVISIB 75S 120 m) and the PSR map
    -> docs/data/MILESTONE5_ILLUMINATION_VALIDATION.json

  python illumination_sites.py            # all sites (needs pipeline/raw: LDEM_75S_240M.IMG, Site* surf, AVGVISIB)
"""
from __future__ import annotations

import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds

from horizon_mask import PolarDEM, destination
from lunar_geom import R_MOON_KM, az_el, disc_fraction_above, unit

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / 'web/public/data/terrain'
RAW = ROOT / 'pipeline/raw'
R_M = R_MOON_KM * 1000
OBS_M = 2.0
AZ = np.arange(0, 360, 0.5)
GRID = 21  # far-field grid points per side (every 20 mesh vertices = 400 m)
FAR_D = np.concatenate([np.arange(0.24, 20, 0.24), np.arange(20, 60, 0.5), np.arange(60, 250.001, 1.0)])  # km
PSR_URL = 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LPSR_80S_20MPP_ADJ.TIF'
AVG = {'sun': RAW / 'AVGVISIB_75S_120M_201608.TIF', 'earth': RAW / 'AVGVISIB_75S_120M_201608_EARTH.TIF'}
SUN_R_DEG = 0.2666


def polar_xy(lat, lon):
    rho = 2 * R_M * np.tan(np.pi / 4 + np.radians(lat) / 2)
    return rho * np.sin(np.radians(lon)), rho * np.cos(np.radians(lon))


def polar_latlon(x, y):
    rho = np.hypot(x, y)
    return np.degrees(2 * np.arctan(rho / (2 * R_M)) - np.pi / 2), np.degrees(np.arctan2(x, y)) % 360


def elev_deg(d_km, h_m, h0_m):
    """Exact elevation angle of terrain at arc distance d and height h, seen from height h0 (mirrors terrainElevationDeg)."""
    th = d_km / R_MOON_KM
    ro, rp = R_MOON_KM + h0_m / 1000, R_MOON_KM + h_m / 1000
    return np.degrees(np.arctan2(rp * np.cos(th) - ro, rp * np.sin(th)))


def bilinear(img, row, col):
    h, w = img.shape
    ok = (row >= 0) & (col >= 0) & (row <= h - 1) & (col <= w - 1)
    r0 = np.clip(np.floor(row).astype(int), 0, h - 2)
    c0 = np.clip(np.floor(col).astype(int), 0, w - 2)
    fr, fc = np.clip(row - r0, 0, 1), np.clip(col - c0, 0, 1)
    v = (img[r0, c0] * (1 - fc) + img[r0, c0 + 1] * fc) * (1 - fr) + (img[r0 + 1, c0] * (1 - fc) + img[r0 + 1, c0 + 1] * fc) * fr
    return np.where(ok, v, np.nan)


class Site:
    def __init__(self, info):
        self.info = info
        self.id = info['id']
        self.meta = json.loads((WEB / self.id / 'terrain.json').read_text())
        m = self.meta
        self.h20 = np.frombuffer((WEB / self.id / m['assets']['surf']['file']).read_bytes(), '<f4').reshape(m['height'], m['width']).astype(np.float64)
        self.x0, self.y0, self.dx, self.dy = m['x0'], m['y0'], m['dx'], m['dy']
        self.x1, self.y1 = self.x0 + (m['width'] - 1) * self.dx, self.y0 + (m['height'] - 1) * self.dy

    def inside(self, x, y):
        return (x >= self.x0) & (x <= self.x1) & (y <= self.y0) & (y >= self.y1)

    def vertex(self, r, c):
        x, y = self.x0 + c * self.dx, self.y0 + r * self.dy
        lat, lon = polar_latlon(x, y)
        return float(lat), float(lon), float(self.h20[r, c])


def far_field(site: Site, dem: PolarDEM):
    el = np.zeros((GRID, GRID, len(AZ)), np.float64)
    dist = np.zeros_like(el)
    A, D = np.meshgrid(AZ, FAR_D, indexing='ij')
    for gr in range(GRID):
        for gc in range(GRID):
            lat, lon, h = site.vertex(gr * 20, gc * 20)
            plat, plon = destination(lat, lon, A, D)
            px, py = polar_xy(plat, plon)
            e = elev_deg(D, dem.sample(plat, plon), h + OBS_M)
            e[site.inside(px, py)] = -90.0  # terrain inside the crop comes from the 20 m mesh in the browser
            k = e.argmax(axis=1)
            el[gr, gc] = e[np.arange(len(AZ)), k]
            dist[gr, gc] = FAR_D[k]
    return el, dist


class Native:
    """Whole native 5 m PGDA DEM for the site (reference only)."""

    def __init__(self, site: Site):
        product = site.meta['product'] if 'product' in site.meta else 'Site01'
        folder = RAW / (product if (RAW / product).exists() else product.lower())
        with rasterio.open(folder / f'{product}_final_adj_5mpp_surf.tif') as src:
            self.z = src.read(1).astype(np.float64)
            self.t = src.transform

    def sample(self, x, y):
        col = (x - self.t.c) / self.t.a - 0.5
        row = (y - self.t.f) / self.t.e - 0.5
        return bilinear(self.z, row, col)


def reference_mask(site: Site, native: Native, dem: PolarDEM, lat, lon, h0, az, near_step_km=0.01):
    """Exact horizon at (lat, lon): native 5 m DEM wherever it covers, 240 m DEM beyond. Returns degrees per azimuth."""
    near = np.arange(near_step_km, 25.0, near_step_km)
    d = np.concatenate([near, FAR_D[FAR_D > 25.0]])
    A, D = np.meshgrid(az, d, indexing='ij')
    plat, plon = destination(lat, lon, A, D)
    px, py = polar_xy(plat, plon)
    hn = native.sample(px, py)
    h = np.where(np.isfinite(hn), hn, dem.sample(plat, plon))
    return elev_deg(D, h, h0 + OBS_M).max(axis=1)


def psr_crop(site: Site):
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'):
        with rasterio.open('/vsicurl/' + PSR_URL) as src:
            w = from_bounds(site.x0 - 40, site.y1 - 40, site.x1 + 40, site.y0 + 40, src.transform)
            w = w.round_offsets().round_lengths()
            a = src.read(1, window=w)
            t = src.window_transform(w)
            info = {'url': PSR_URL, 'crs': src.crs.to_proj4(), 'resolutionM': list(src.res), 'window': [int(w.col_off), int(w.row_off), int(w.width), int(w.height)],
                    'windowSha256': hashlib.sha256(a.tobytes()).hexdigest(), 'dtype': str(a.dtype)}
    cols = np.arange(site.meta['width']) * site.dx + site.x0
    rows = np.arange(site.meta['height']) * site.dy + site.y0
    ci = np.floor((cols - t.c) / t.a).astype(int)
    ri = np.floor((rows - t.f) / t.e).astype(int)
    v = a[np.ix_(ri, ci)]
    out = np.where(np.isfinite(v), (v > 0.5).astype(np.uint8), 255).astype(np.uint8)
    return out, info


def pgda_fraction(ds, x, y):
    """AVGVISIB is int16 with scale 4e-05 (fraction of time visible, 0..1); nodata -32768."""
    v = float(next(ds.sample([(x, y)]))[0])
    if v == ds.nodata:
        return float('nan')
    return v * (ds.scales[0] if ds.scales else 1.0) + (ds.offsets[0] if ds.offsets else 0.0)


def resample_pgda():
    """Re-read the PGDA reference values into an existing report (no horizon recomputation)."""
    path = ROOT / 'docs/data/MILESTONE5_ILLUMINATION_VALIDATION.json'
    rep = json.loads(path.read_text())
    srcs = {k: rasterio.open(p) for k, p in AVG.items()}
    for pts in rep['sites'].values():
        for q in pts:
            x, y = polar_xy(q['lat'], q['lon'])
            q['pgdaSunPct'] = 100 * pgda_fraction(srcs['sun'], x, y)
            q['pgdaEarthPct'] = 100 * pgda_fraction(srcs['earth'], x, y)
    path.write_text(json.dumps(rep, indent=1))


def long_term(site: Site, native: Native, dem: PolarDEM, psr: np.ndarray, eph: np.ndarray):
    """Sunlit / Earth-visible fractions 2023-2031 hourly at a 9 x 9 grid (every 50 vertices = 1 km)."""
    earth, sun = eph[:, :3], eph[:, 3:]
    srcs = {k: rasterio.open(p) for k, p in AVG.items()}
    out = []
    for r in range(0, 401, 50):
        for c in range(0, 401, 50):
            lat, lon, h = site.vertex(r, c)
            mask = reference_mask(site, native, dem, lat, lon, h, AZ)
            saz, sel = az_el(sun, lon, lat)
            pos = unit(lon, lat) * (R_MOON_KM + (h + OBS_M) / 1000)
            ev = earth - pos
            eaz, eel = az_el(ev, lon, lat)
            erad = np.degrees(np.arcsin(6371.0 / np.linalg.norm(ev, axis=1)))
            hs = np.interp(saz, np.append(AZ, 360), np.append(mask, mask[0]))
            he = np.interp(eaz, np.append(AZ, 360), np.append(mask, mask[0]))
            x, y = polar_xy(lat, lon)
            ref = {}
            for k, ds in srcs.items():
                ref[k] = pgda_fraction(ds, x, y)
            out.append({
                'row': r, 'col': c, 'lat': lat, 'lon': lon, 'elevationM': h, 'psr': int(psr[r, c]),
                'oursSunDiscPct': 100 * float(np.mean(disc_fraction_above(sel - hs, SUN_R_DEG))),
                'oursSunAnyPct': 100 * float(np.mean(sel - hs + SUN_R_DEG > 0)),
                'oursEarthAnyPct': 100 * float(np.mean(eel - he + erad > 0)),
                'pgdaSunPct': 100 * ref['sun'], 'pgdaEarthPct': 100 * ref['earth'],
            })
    return out


def write_site(site: Site, dem: PolarDEM, eph: np.ndarray, rng):
    t0 = time.time()
    out = WEB / site.id / 'illumination'
    out.mkdir(parents=True, exist_ok=True)
    el, dist = far_field(site, dem)
    el_i = np.round(el * 100).astype('<i2')
    d_u = np.round(dist * 10).astype('<u2')
    (out / 'far_el.i16').write_bytes(el_i.tobytes())
    (out / 'far_d.u16').write_bytes(d_u.tobytes())
    psr, psr_info = psr_crop(site)
    (out / 'psr.u8').write_bytes(psr.tobytes())
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    meta = {
        'version': 1, 'siteId': site.id, 'grid': GRID, 'gridStepVertices': 20, 'azStepDeg': 0.5, 'azCount': len(AZ),
        'observerHeightM': OBS_M, 'farElQuantumDeg': 0.01, 'farDistQuantumKm': 0.1, 'maxDistanceKm': float(FAR_D[-1]),
        'farTerrain': 'LOLA LDEM_75S_240M (same DEM as the planner horizon masks), samples outside the crop only',
        'assets': {'farEl': {'file': 'far_el.i16', 'sha256': sha(out / 'far_el.i16')}, 'farDist': {'file': 'far_d.u16', 'sha256': sha(out / 'far_d.u16')},
                   'psr': {'file': 'psr.u8', 'sha256': sha(out / 'psr.u8'), 'width': 401, 'height': 401, 'source': psr_info,
                           'note': 'NASA PGDA product 90 (Barker et al.), 20 m, MOON_ME/DE421, sampled at mesh vertices. Static context.'}},
        'psrFraction': float((psr == 1).mean()),
    }
    (out / 'illumination.json').write_text(json.dumps(meta, indent=1))
    print(site.id, 'far-field + PSR', f'{time.time() - t0:.0f}s', 'psr', round(meta['psrFraction'], 3), flush=True)

    native = Native(site)
    ref = []
    for _ in range(36):  # random vertices (incl. edge band) x 6 azimuths, native-resolution reference horizons
        r, c = (int(v) for v in rng.integers(0, 401, 2))
        lat, lon, h = site.vertex(r, c)
        az = np.sort(rng.uniform(0, 360, 6))
        ref.append({'row': r, 'col': c, 'az': [float(a) for a in az],
                    'horizonDeg': [float(v) for v in reference_mask(site, native, dem, lat, lon, h, az, near_step_km=0.005)]})
    lt = long_term(site, native, dem, psr, eph)
    print(site.id, 'reference + long-term', f'{time.time() - t0:.0f}s', flush=True)
    return ref, lt


def main(ids):
    dem = PolarDEM()
    eph = np.frombuffer((ROOT / 'pipeline/out/ephem_hourly.bin').read_bytes(), '<f4').reshape(-1, 6).astype(np.float64)
    index = json.loads((WEB / 'index.json').read_text())
    rng = np.random.default_rng(5)
    fixture = {'note': 'native 5 m PGDA DEM (10 m-step... 5 m steps to 25 km) + LDEM_75S_240M beyond; observer 2 m; exact spherical geometry',
               'generated': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'sites': {}}
    report = {'generated': fixture['generated'], 'period': 'hourly 2023-01-01 to 2031-12-31 23:00 UTC (full Horizons series)',
              'reference': 'NASA PGDA product 69 AVGVISIB 75S 120 m (Mazarico et al. 2011, 18.6-yr average) and product 90 LPSR 20 m',
              'ours': 'native 5 m PGDA DEM + LDEM_75S_240M horizons (0.5 deg), observer 2 m, upper-limb rule', 'sites': {}}
    for info in index['sites']:
        if ids and info['id'] not in ids:
            continue
        site = Site(info)
        ref, lt = write_site(site, dem, eph, rng)
        fixture['sites'][site.id] = ref
        report['sites'][site.id] = lt
    (ROOT / 'web/src/lib/__fixtures__/shadow_reference.json').write_text(json.dumps(fixture))
    (ROOT / 'docs/data/MILESTONE5_ILLUMINATION_VALIDATION.json').write_text(json.dumps(report, indent=1))


if __name__ == '__main__':
    if sys.argv[1:] == ['--resample-pgda']:
        resample_pgda()
    else:
        main(sys.argv[1:])
