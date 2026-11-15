"""Milestone 3: the verified Site01 terrain + hazard pipeline, generalised to several LOLA sites.

Same steps, same parameters and the *same functions* as Milestones 1-2 for every site:
  native 5 m PGDA GeoTIFF  ->  1601 x 1601 native crop (8 x 8 km)  ->  every 4th sample = 401 x 401
  display mesh at 20 m (no invented heights)  ->  3x3 OLS slope (15 m support) and 5x5 detrended RMS
  roughness (25 m support) computed on the native 5 m crop with `hazard_site01.plane_metrics`.

Sites (NASA GSFC PGDA product 78, Barker et al. 2021; names from the product README):
  site01  Site01  Connecting ridge   crop centred on the curated Connecting Ridge coordinate (as in M1)
  site04  Site04  Shackleton rim     crop centred on the centre of the NASA product footprint
  site06  Site06  Nobile rim 1       crop centred on the centre of the NASA product footprint
          (Site06 is documented in the PGDA README and served at the documented path, but is not listed
           in the HTML directory index; the file is verified by opening it as a GeoTIFF.)

Usage:
  python terrain_sites.py site04 site06          # build assets into web/public/data/terrain/<id>/
  python terrain_sites.py --check-site01         # rebuild Site01 into a temp dir; prove byte equality
  python terrain_sites.py --index                # write web/public/data/terrain/index.json
Raw downloads stay in ignored pipeline/raw/<Product>/. No credentials; system TLS trust only.
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import tempfile
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.windows import Window

from hazard_site01 import plane_metrics
from terrain_site01 import CRS_POLAR, R, digest, fetch, inspect

ROOT = Path(__file__).resolve().parents[1]
PGDA = 'https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/'
WEB = ROOT / 'web/public/data/terrain'
HALF = 800          # native pixels from the crop centre to each edge -> 1601 x 1601 = 8 km
STEP = 4            # display mesh keeps every 4th native sample -> 20 m
CHECK_POINTS = [(0, 0), (100, 200), (800, 800), (1600, 1600), (913, 1101)]
MESH_CHECKPOINTS = [(0, 0), (0, 400), (200, 200), (400, 0), (400, 400), (173, 279)]

SITES = {
    'site01': {
        'product': 'Site01', 'name': 'Connecting Ridge', 'readmeName': 'Connecting ridge',
        'plannerId': 'connecting-ridge',
        'centre': {'lat': -89.53432, 'lon': 209.94767},
        'centreSource': 'Curated Connecting Ridge coordinate (Artemis III landing-site workshop 2023, abstract #2036), as in Milestone 1',
    },
    'site04': {
        'product': 'Site04', 'name': 'Shackleton Rim', 'readmeName': 'Shackleton rim',
        'plannerId': 'shackleton-rim-site04', 'centre': 'footprint',
        'centreSource': 'Centre pixel of the NASA PGDA Site04 5 m DEM footprint (no independent landing coordinate is claimed)',
    },
    'site06': {
        'product': 'Site06', 'name': 'Nobile Rim 1', 'readmeName': 'Nobile rim 1',
        'plannerId': 'nobile-rim-1-site06', 'centre': 'footprint',
        'centreSource': 'Centre pixel of the NASA PGDA Site06 5 m DEM footprint (no independent landing coordinate is claimed)',
    },
}

# Observed over TLS-verified NASA HTTPS (not publisher-issued checksums). A change means NASA replaced the
# product; investigate before updating. Site01 values are the Milestone 1/2 pins.
EXPECTED_SHA256 = {
    ('Site01', 'surf'): '3ba7b97cb00a2bcf21189c3aeb535f65afc21207154ab9f0d43c5bdc1f7e747e',
    ('Site01', 'toterr'): 'cf2cf52f52d2aa51e60d058010d10b0ebfb1d3e920f5a2b9a46eb6c51054ab1c',
    ('Site01', 'slp'): '3a90035a4946b4a04b7332c52f0b2b1cff71648bd8c105e14d8a7e15c6bcfe8e',
    ('Site04', 'surf'): '38ff70dbdf2f066c2cfa94a646c3a59d653ce7f6b4528b15fc1b43ee397ce758',
    ('Site06', 'surf'): 'cca17e8067601dd659b583f889204db6bce685bc30c60a9e62427a8bce36b03d',
}

FWD = Transformer.from_crs(CRS_POLAR.geodetic_crs, CRS_POLAR, always_xy=True)
INV = Transformer.from_crs(CRS_POLAR, CRS_POLAR.geodetic_crs, always_xy=True)


def source(product: str, kind: str) -> dict:
    name = f'{product}_final_adj_5mpp_{kind}.tif'
    path = ROOT / 'pipeline/raw' / product / name
    info = fetch(PGDA + f'{product}/{name}', path)
    pin = EXPECTED_SHA256.get((product, kind))
    if pin and info['sha256'] != pin:
        raise ValueError(f'{name}: source bytes changed; investigate the NASA product before updating the pin')
    info['metadata'] = inspect(path)
    info['path'] = path
    return info


def crop_origin(site: dict, surf: dict):
    """Native (row, col) of the crop's first sample, and the crop centre in lat/lon and map metres."""
    with rasterio.open(surf['path']) as src:
        if site['centre'] == 'footprint':
            row, col = src.height // 2, src.width // 2
            x, y = src.xy(row, col)  # pixel centre
            lon, lat = INV.transform(x, y)
            centre = {'lat': float(lat), 'lon': float(lon % 360)}
        else:
            centre = dict(site['centre'])
            x, y = FWD.transform(centre['lon'], centre['lat'])
            row, col = src.index(x, y)
        r0, c0 = row - HALF, col - HALF
        # hazard analysis needs a 2-pixel halo for complete 5x5 neighbourhoods at the crop edge
        if min(r0, c0) < 2 or r0 + 2 * HALF + 3 > src.height or c0 + 2 * HALF + 3 > src.width:
            raise ValueError(f"{site['product']}: requested 8 km crop (+halo) exceeds real source coverage")
        x0, y0 = src.xy(r0, c0)
    return r0, c0, centre, (x, y), (row, col), (x0, y0)


def build_site(site_id: str, out_root: Path = WEB) -> dict:
    site = SITES[site_id]
    out = out_root / site_id
    (out / 'hazards').mkdir(parents=True, exist_ok=True)
    surf, toterr, slp = (source(site['product'], k) for k in ('surf', 'toterr', 'slp'))
    for other in (toterr, slp):
        if other['metadata']['transform'] != surf['metadata']['transform'] or other['metadata']['width'] != surf['metadata']['width']:
            raise ValueError(f"{other['file']} is not co-registered with the elevation grid")
    r0, c0, centre, (cx, cy), (crow, ccol), (x0, y0) = crop_origin(site, surf)
    n = 2 * HALF + 1
    sources = {k: {kk: v for kk, v in s.items() if kk != 'path'} for k, s in (('surf', surf), ('toterr', toterr))}
    manifest = {
        'version': 1, 'siteId': site_id, 'name': site['name'], 'product': site['product'],
        'plannerId': site['plannerId'], 'centreSource': site['centreSource'],
        'width': n // STEP + 1, 'height': n // STEP + 1, 'x0': x0, 'y0': y0,
        'dx': float(STEP * 5), 'dy': float(-STEP * 5), 'radiusM': R, 'origin': centre,
        'projection': 'south-polar-stereographic', 'frame': 'MOON_ME / DE421 (PGDA)',
        'heightDatum': 'metres above the 1737400 m lunar reference sphere',
        'sourceResolutionM': 5, 'sources': sources, 'assets': {}, 'imagery': None,
        'uncertaintyNote': 'PGDA total Z RMS error, including interpolation. About 90% of native 5 m pixels are interpolated. Pixel spacing is not accuracy.',
    }
    with rasterio.open(surf['path']) as src:
        native = src.read(1, window=Window(c0, r0, n, n), masked=True).filled(np.nan).astype(np.float64)
        halo = src.read(1, window=Window(c0 - 2, r0 - 2, n + 4, n + 4), masked=True).filled(np.nan).astype(np.float64)
        crs, transform = src.crs, src.window_transform(Window(c0, r0, n, n))
        manifest['nativeCrop'] = {'row0': int(r0), 'col0': int(c0), 'rows': n, 'cols': n,
                                  'validNativeSamples': int(np.isfinite(native).sum())}
    for kind, filename, info in (('surf', 'elevation.f32', surf), ('toterr', 'uncertainty.f32', toterr)):
        with rasterio.open(info['path']) as src:
            grid = src.read(1, window=Window(c0, r0, n, n), masked=True).filled(np.nan)[::STEP, ::STEP].astype('<f4')
        if grid.shape != (manifest['height'], manifest['width']):
            raise ValueError('Incomplete grid')
        if kind == 'toterr' and np.any(grid[np.isfinite(grid)] < 0):
            raise ValueError('Negative RMS uncertainty')
        (out / filename).write_bytes(grid.tobytes())
        manifest['assets'][kind] = {'file': filename, 'sha256': digest(out / filename), 'validSamples': int(np.isfinite(grid).sum()),
                                    'min': float(np.nanmin(grid)), 'max': float(np.nanmax(grid)), 'median': float(np.nanmedian(grid))}
    # Decimation residual of the triangulated 20 m mesh against every native 5 m sample (same formula as M1)
    coarse = native[::STEP, ::STEP]
    m1 = coarse.shape[0] - 1
    rr, cc = np.meshgrid(np.arange(n) / STEP, np.arange(n) / STEP, indexing='ij')
    r = np.minimum(rr.astype(int), m1 - 1)
    c = np.minimum(cc.astype(int), m1 - 1)
    fr, fc = rr - r, cc - c
    a, b, d, e = coarse[r, c], coarse[r, c + 1], coarse[r + 1, c], coarse[r + 1, c + 1]
    model = np.where(fc + fr <= 1, a * (1 - fc - fr) + b * fc + d * fr, b * (1 - fr) + d * (1 - fc) + e * (fc + fr - 1))
    residual = (model - native)[np.isfinite(model) & np.isfinite(native)]
    manifest['decimationResidualM'] = {'against': 'native 5 m DEM samples, not independent ground truth',
                                       'rms': float(np.sqrt(np.mean(residual ** 2))), 'p95Abs': float(np.percentile(np.abs(residual), 95)),
                                       'maxAbs': float(np.max(np.abs(residual))), 'samples': int(residual.size)}
    checks = []
    with rasterio.open(surf['path']) as src:
        for rr_, cc_ in MESH_CHECKPOINTS:
            px, py = x0 + cc_ * STEP * 5, y0 - rr_ * STEP * 5
            lon, lat = INV.transform(px, py)
            bx, by = FWD.transform(lon, lat)
            checks.append({'row': rr_, 'col': cc_, 'lat': lat, 'lon': lon % 360,
                           'elevationM': float(next(src.sample([(px, py)]))[0]), 'projectionErrorM': math.hypot(bx - px, by - py)})
        manifest['alignment'] = {'checkpoints': checks, 'siteX': cx, 'siteY': cy, 'siteSourceRow': int(crow), 'siteSourceCol': int(ccol),
                                 'siteNativeElevationM': float(next(src.sample([(cx, cy)]))[0])}
    (out / 'terrain.json').write_text(json.dumps(manifest, indent=2, allow_nan=False) + '\n')

    # ---- native-resolution hazard layers: identical estimators and parameters to hazard_site01 ------
    sa, sb, _ = plane_metrics(halo, n=3)
    _, _, rough = plane_metrics(halo, n=5)
    sa, sb, rough = sa[2:-2, 2:-2], sb[2:-2, 2:-2], rough[2:-2, 2:-2]
    xx, yy = np.meshgrid(x0 + np.arange(n) * 5, y0 - np.arange(n) * 5)
    k = 1 + (xx * xx + yy * yy) / (4 * R ** 2)
    factor = k / (1 + halo[2:-2, 2:-2] / R)
    slope = np.degrees(np.arctan(np.hypot(sa, sb) * factor))
    hz = {'version': 1, 'width': n, 'height': n, 'x0': x0, 'y0': y0, 'dx': 5, 'dy': -5,
          'sourceSha256': surf['sha256'], 'slopeSupportM': 15, 'roughnessSupportM': 25, 'quantum': .001, 'noData': 65535,
          'method': '3x3 OLS plane slope; 5x5 OLS detrended radial-height RMS; complete native 5 m neighbourhoods; slope uses stereographic/elevation scale correction',
          'assets': {}, 'points': []}
    sci = ROOT / 'pipeline/out/hazards' / site_id
    sci.mkdir(parents=True, exist_ok=True)
    for name, arr in (('slope', slope), ('roughness', rough)):
        if np.nanmax(arr) > 65.534:
            raise ValueError(f'{name}: quantization range exceeded')
        enc = np.full(arr.shape, 65535, dtype='<u2')
        valid = np.isfinite(arr)
        enc[valid] = np.rint(arr[valid] * 1000).astype('<u2')
        f = out / 'hazards' / f'{name}.u16'
        f.write_bytes(enc.tobytes())
        with rasterio.open(sci / f'{name}.tif', 'w', driver='GTiff', width=n, height=n, count=1, dtype='float32', crs=crs,
                           transform=transform, nodata=np.nan, compress='deflate') as dst:
            dst.write(arr.astype('float32'), 1)
        hz['assets'][name] = {'file': f.name, 'sha256': digest(f), 'units': 'degrees' if name == 'slope' else 'm',
                              'min': float(np.nanmin(arr)), 'max': float(np.nanmax(arr))}
    with rasterio.open(slp['path']) as src:
        ref = src.read(1, window=Window(c0, r0, n, n), masked=True).filled(np.nan)
    res = slope - ref
    v = np.isfinite(res)
    hz['officialComparison'] = {'metadata': slp['metadata'], 'url': slp['url'], 'sha256': slp['sha256'],
                                'rmsDifferenceDeg': float(np.sqrt(np.mean(res[v] ** 2))), 'maxAbsDifferenceDeg': float(np.max(np.abs(res[v]))),
                                'note': 'Different slope estimators/support may differ; official product is a comparison, not substituted ground truth.'}
    errors = []
    for row, col in CHECK_POINTS:
        vals = {}
        for nn, key in ((3, 'slope'), (5, 'roughness')):
            q = nn // 2
            local = halo[row + 2 - q:row + 3 + q, col + 2 - q:col + 3 + q]
            gx, gy = np.meshgrid((np.arange(nn) - q) * 5, -(np.arange(nn) - q) * 5)
            A = np.column_stack([gx.ravel(), gy.ravel(), np.ones(nn * nn)])
            coef = np.linalg.lstsq(A, local.ravel(), rcond=None)[0]
            value = (np.degrees(np.arctan(np.hypot(*coef[:2]) * factor[row, col])) if key == 'slope'
                     else np.sqrt(np.mean((local.ravel() - A @ coef) ** 2)))
            actual = (slope if key == 'slope' else rough)[row, col]
            errors.append(abs(float(actual - value)))
            vals[key] = float(actual)
        hz['points'].append({'row': row, 'col': col, **vals})
    hz['independentMaxDifference'] = max(errors)
    (out / 'hazards' / 'hazards.json').write_text(json.dumps(hz, indent=2) + '\n')
    return {'terrain': manifest, 'hazards': hz}


def check_site01() -> dict:
    """Rebuild Site01 with the generalised code; every shipped Site01 asset byte must be identical."""
    tracked = WEB / 'site01'
    with tempfile.TemporaryDirectory() as tmp:
        build_site('site01', Path(tmp))
        rows = []
        for rel in ('elevation.f32', 'uncertainty.f32', 'hazards/slope.u16', 'hazards/roughness.u16'):
            a, b = digest(Path(tmp) / 'site01' / rel), digest(tracked / rel)
            rows.append({'file': rel, 'generalised': a, 'milestone12': b, 'identical': a == b})
        old = json.loads((tracked / 'terrain.json').read_text())
        new = json.loads((Path(tmp) / 'site01' / 'terrain.json').read_text())
        same_geo = all(old[k] == new[k] for k in ('x0', 'y0', 'dx', 'dy', 'width', 'height', 'origin', 'decimationResidualM'))
    shutil.rmtree(ROOT / 'pipeline/out/hazards/site01', ignore_errors=True)
    return {'files': rows, 'georeferencingAndResidualIdentical': same_geo, 'allIdentical': all(r['identical'] for r in rows) and same_geo}


def write_index() -> dict:
    sites = []
    for sid, site in SITES.items():
        t = json.loads((WEB / sid / 'terrain.json').read_text())
        h = json.loads((WEB / sid / 'hazards' / 'hazards.json').read_text())
        sites.append({'id': sid, 'name': site['name'], 'product': site['product'], 'readmeName': site['readmeName'],
                      'plannerId': site['plannerId'], 'centre': t['origin'], 'centreSource': site['centreSource'],
                      'extentM': [(t['width'] - 1) * t['dx'], (t['height'] - 1) * -t['dy']], 'meshSpacingM': t['dx'],
                      'nativeSpacingM': h['dx'], 'sourceUrl': t['sources']['surf']['url'], 'sourceSha256': t['sources']['surf']['sha256']})
    index = {'version': 1, 'product': 'https://pgda.gsfc.nasa.gov/products/78',
             'citation': 'Barker, M. K., et al. (2021). Improved LOLA elevation maps for south pole landing sites. PSS 203, 105119. doi:10.1016/j.pss.2020.105119',
             'method': 'Identical for every site: 8 x 8 km native 5 m crop; 20 m display mesh = every 4th native sample; 3x3 OLS slope (15 m support) and 5x5 detrended RMS roughness (25 m support) on the native grid.',
             'sites': sites}
    (WEB / 'index.json').write_text(json.dumps(index, indent=2) + '\n')
    return index


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('sites', nargs='*', help='site ids: site04 site06')
    p.add_argument('--check-site01', action='store_true')
    p.add_argument('--index', action='store_true')
    a = p.parse_args()
    bad = [x for x in a.sites if x not in SITES or x == 'site01']
    if bad:
        p.error(f'unknown or protected site ids: {bad} (Site01 is rebuilt only by --check-site01)')
    for sid in a.sites:
        r = build_site(sid)
        t, h = r['terrain'], r['hazards']
        print(sid, 'centre', t['origin'], 'elev', round(t['assets']['surf']['min'], 1), '..', round(t['assets']['surf']['max'], 1),
              'decim rms', round(t['decimationResidualM']['rms'], 4), 'slope max', round(h['assets']['slope']['max'], 2),
              'vs NASA rms', round(h['officialComparison']['rmsDifferenceDeg'], 4), 'indep', h['independentMaxDifference'])
    if a.check_site01:
        print(json.dumps(check_site01(), indent=2))
    if a.index:
        print(json.dumps(write_index(), indent=2)[:1500])
