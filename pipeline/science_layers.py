"""Milestone 8: optional science overlays on the processed 5 m terrain sites (reusable per-site layer framework).

Writes web/public/data/terrain/<site>/science/index.json + one binary per layer (Uint16 LE, scale/offset, noData),
sampled on the site's mesh vertices (every `stride` vertices of the 401 x 401 / 20 m grid).

Integrated datasets (feasibility audit in docs/MILESTONE8_ACCEPTANCE.md):
  * LRO Diviner Polar Resource Products, LRO-L-DLRE-5-PRP-V2.0 (Paige et al. 2010; PDS Geosciences) - MODEL-DERIVED
    from thermal-model fits to the first mapping year: annual average temperature at 2 cm depth (K), annual maximum
    surface temperature (K), depth at which water ice would be stable (sublimation < 1 kg m^-2 per Gyr; m).
    Triangular mesh (~0.5 km) on a Kaguya-derived polar DEM. Sampled by the triangle containing each vertex.
  * KPLO ShadowCam controlled mosaic shackleton01 (20 m COG, polar stereographic R = 1737.4 km) - OBSERVED
    I/F reflectance of the permanently shadowed interior (scattered light). Only Site04 overlaps; other sites none.

  python science_layers.py              # streams the 605 MB Diviner table once (hash recorded) and the COG window
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
import requests
from rasterio.windows import from_bounds
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / 'web/public/data/terrain'
OUT = ROOT / 'pipeline/out/science'
R_KM = 1737.4
PRP_URL = 'https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.tab'
PRP_LABEL = 'https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/dlre_prp_south.xml'
SC_URL = 'https://pds.shadowcam.im-ldi.com/derived/cmosaic/shackleton01/shadowcam_cmosaic_shackleton01_p896s1350_summer_11am_20m_cog.tif'
SC_LABEL = SC_URL.replace('_cog.tif', '_cog.xml')
LAT_KEEP = -84.9  # all three crops lie south of this latitude
NODATA, SPECIAL, UNDOC = 65535, 65534, 65533
MIN_COVERAGE_PCT = 2.0  # a layer covering less of the crop than this is not offered


def polar_xy_km(lat, lon):
    rho = 2 * R_KM * np.tan(np.pi / 4 + np.radians(lat) / 2)
    return rho * np.sin(np.radians(lon)), rho * np.cos(np.radians(lon))


def xyz_to_polar_km(x, y, z):
    lat = np.degrees(np.arctan2(z, np.hypot(x, y)))
    lon = np.degrees(np.arctan2(y, x))
    return polar_xy_km(lat, lon)


def stream_prp():
    """Stream the Diviner south PRP table, hash every byte, keep rows south of LAT_KEEP."""
    cache = OUT / 'diviner_prp_south_subset.npz'
    if cache.exists():
        d = np.load(cache)
        return {k: d[k] for k in d.files}, json.loads((OUT / 'diviner_prp_south_subset.json').read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    h = hashlib.sha256()
    rows, n, t0 = [], 0, time.time()
    with requests.get(PRP_URL, stream=True, timeout=600) as r:
        r.raise_for_status()
        size = int(r.headers.get('Content-Length', 0))
        buf = b''
        header = None
        for chunk in r.iter_content(1 << 20):
            h.update(chunk)
            buf += chunk
            lines = buf.split(b'\n')
            buf = lines.pop()
            for line in lines:
                if header is None:
                    header = [c.strip() for c in line.decode().split(',')]
                    continue
                n += 1
                c = line.split(b',')
                if float(c[10]) <= LAT_KEEP:
                    rows.append([float(v) for v in c])
        if buf.strip():
            raise RuntimeError('truncated final line')
    a = np.array(rows)
    data = {name: a[:, i] for i, name in enumerate(header)}
    meta = {'url': PRP_URL, 'bytes': size, 'sha256': h.hexdigest(), 'rowsTotal': n, 'rowsKept': len(rows), 'latKeep': LAT_KEEP,
            'columns': header, 'retrieved': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'seconds': round(time.time() - t0)}
    if n != 2_880_000:
        raise RuntimeError(f'expected 2,880,000 rows, got {n}')
    np.savez_compressed(cache, **data)
    (OUT / 'diviner_prp_south_subset.json').write_text(json.dumps(meta, indent=1))
    return data, meta


def containing_triangles(prp, px, py):
    """Index of the PRP triangle containing each point (map-plane km), by barycentric test on the 8 nearest centres."""
    cx, cy = polar_xy_km(prp['tri_clat'], prp['tri_clon'])
    tree = cKDTree(np.c_[cx, cy])
    vx = np.empty((len(cx), 3)), np.empty((len(cx), 3))
    for k in range(3):
        vx[0][:, k], vx[1][:, k] = xyz_to_polar_km(prp[f'tri{k + 1}_x'], prp[f'tri{k + 1}_y'], prp[f'tri{k + 1}_z'])
    d, cand = tree.query(np.c_[px, py], k=8)
    out = np.full(len(px), -1)
    for j in range(8):
        t = cand[:, j]
        ax, ay = vx[0][t, 0], vx[1][t, 0]
        bx, by = vx[0][t, 1], vx[1][t, 1]
        qx, qy = vx[0][t, 2], vx[1][t, 2]
        den = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy)
        l1 = ((by - qy) * (px - qx) + (qx - bx) * (py - qy)) / den
        l2 = ((qy - ay) * (px - qx) + (ax - qx) * (py - qy)) / den
        inside = (l1 >= -1e-9) & (l2 >= -1e-9) & (1 - l1 - l2 >= -1e-9) & (out < 0)
        out[inside] = t[inside]
    return out, d[:, 0]


def encode(v, scale, specials=()):
    q = np.full(v.shape, NODATA, np.uint16)
    ok = np.isfinite(v)
    q[ok] = np.clip(np.round(v[ok] / scale), 0, UNDOC - 1).astype(np.uint16)
    for mask, code in specials:
        q[mask] = code
    return q


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def site_vertices(sid, stride):
    m = json.loads((WEB / sid / 'terrain.json').read_text())
    idx = np.arange(0, m['width'], stride)
    xs = m['x0'] + idx * m['dx']
    ys = m['y0'] + idx * m['dy']
    X, Y = np.meshgrid(xs, ys)
    return m, X.ravel() / 1000, Y.ravel() / 1000, len(idx)


def diviner_layers(sid, prp, meta):
    stride = 4
    m, px, py, n = site_vertices(sid, stride)
    tri, _ = containing_triangles(prp, px, py)
    ok = tri >= 0
    get = lambda k: np.where(ok, prp[k][np.maximum(tri, 0)], np.nan)
    tavg, tmax, ice = get('temp_avg'), get('temp_max'), get('ice_depth')
    deep = ok & (ice == -999.0)
    undoc = ok & (ice == -1.0)  # present in the coldest facets but not defined by the PDS label: never interpreted
    ice = np.where(deep | undoc, np.nan, ice)
    common = {'kind': 'model', 'width': n, 'height': n, 'stride': stride, 'offset': 0, 'noData': NODATA,
              'resolutionM': 500, 'period': 'Thermal-model fits to Diviner observations from the first mapping year (2009–2010)',
              'source': {'title': 'LRO Diviner Polar Resource Products (LRO-L-DLRE-5-PRP-V2.0)', 'url': PRP_URL, 'label': PRP_LABEL,
                         'citation': 'Paige et al. (2010), Science 330; Paige et al., LRO DLRE Level 5 PRP V2.0, NASA PDS (2018)',
                         'sha256': meta['sha256'], 'bytes': meta['bytes']},
              'caveats': ['Model-derived from a thermal model fitted to the first mapping year; not a direct measurement or a forecast for a mission date.',
                          'Triangular facets of about 0.5 km on a Kaguya-derived polar DEM; registration to the LOLA 5 m terrain is not independently verified.',
                          'Values are uniform within each facet: they do not resolve the 20 m mesh.']}
    layers = []
    for lid, title, quantity, v, scale, unit, special in (
        ('diviner-tmax', 'Diviner annual maximum surface temperature (model)', 'temperature', tmax, 0.01, 'K', None),
        ('diviner-tavg', 'Diviner annual average temperature at 2 cm depth (model)', 'temperature', tavg, 0.01, 'K', None),
        ('diviner-ice', 'Diviner depth to stable water ice (model)', 'depth', ice, 0.001, 'm', deep),
    ):
        q = encode(v, scale, [(special, SPECIAL), (undoc, UNDOC)] if special is not None else [])
        f = WEB / sid / 'science' / f'{lid}.u16'
        f.write_bytes(q.astype('<u2').tobytes())
        valid = v[np.isfinite(v)]
        layer = {**common, 'id': lid, 'title': title, 'quantity': quantity, 'unit': unit, 'scale': scale,
                 'file': f.name, 'sha256': sha(f), 'validPct': float(100 * np.isfinite(v).mean()),
                 'min': float(valid.min()) if valid.size else None, 'max': float(valid.max()) if valid.size else None,
                 'legend': {'min': 0 if quantity == 'depth' else 40, 'max': 2.8738 if quantity == 'depth' else 320, 'palette': 'ice' if quantity == 'depth' else 'thermal'}}
        if special is not None:
            layer['specials'] = [
                {'value': SPECIAL, 'label': 'No stable ice within 2.87 m of the surface (model)', 'pct': float(100 * special.mean())},
                {'value': UNDOC, 'label': 'Source code -1 (not defined in the PDS label; not interpreted)', 'pct': float(100 * undoc.mean())},
            ]
            layer['caveats'] = layer['caveats'] + ['Indicates where water ice WOULD be thermally stable if present; it is not evidence that ice is there.']
        layers.append(layer)
    return layers


def shadowcam_layer(sid):
    stride = 1
    m, px, py, n = site_vertices(sid, stride)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR'):
        with rasterio.open('/vsicurl/' + SC_URL) as src:
            b = src.bounds
            if px.max() * 1000 < b.left or px.min() * 1000 > b.right or py.max() * 1000 < b.bottom or py.min() * 1000 > b.top:
                return None
            w = from_bounds(max(b.left, px.min() * 1000 - 40), max(b.bottom, py.min() * 1000 - 40), min(b.right, px.max() * 1000 + 40),
                            min(b.top, py.max() * 1000 + 40), src.transform).round_offsets().round_lengths()
            a = src.read(1, window=w)
            t = src.window_transform(w)
            OUT.mkdir(parents=True, exist_ok=True)
            np.savez_compressed(OUT / f'shadowcam_{sid}_window.npz', a=a, transform=np.array(list(src.window_transform(w))[:6]))
            info = {'crs': src.crs.to_proj4(), 'resolutionM': list(src.res), 'window': [int(w.col_off), int(w.row_off), int(w.width), int(w.height)],
                    'windowSha256': hashlib.sha256(a.tobytes()).hexdigest()}
    col = np.floor((px * 1000 - t.c) / t.a).astype(int)
    row = np.floor((py * 1000 - t.f) / t.e).astype(int)
    inb = (col >= 0) & (row >= 0) & (col < a.shape[1]) & (row < a.shape[0])
    v = np.full(px.shape, np.nan)
    v[inb] = a[row[inb], col[inb]]
    v[~np.isfinite(v) | (v < -1e30) | (v < 0)] = np.nan
    if 100 * np.isfinite(v).mean() < MIN_COVERAGE_PCT:
        return None
    q = encode(v, 2e-5)
    f = WEB / sid / 'science' / 'shadowcam-if.u16'
    f.write_bytes(q.astype('<u2').tobytes())
    valid = v[np.isfinite(v)]
    return {'id': 'shadowcam-if', 'title': 'ShadowCam controlled mosaic, Shackleton (observed I/F)', 'kind': 'observation', 'quantity': 'reflectance',
            'unit': 'I/F', 'scale': 2e-5, 'offset': 0, 'noData': NODATA, 'width': n, 'height': n, 'stride': stride, 'file': f.name, 'sha256': sha(f),
            'validPct': float(100 * np.isfinite(v).mean()), 'min': float(valid.min()), 'max': float(valid.max()),
            'resolutionM': 20, 'period': 'KPLO ShadowCam observations, mosaic group "summer 11am" (PDS release 2025-07-30)',
            'legend': {'min': 0, 'max': float(np.percentile(valid, 99)), 'palette': 'gray'},
            'source': {'title': 'KPLO ShadowCam controlled mosaic shackleton01 (20 m COG)', 'url': SC_URL, 'label': SC_LABEL,
                       'citation': 'ShadowCam team (Arizona State University / KARI / NASA), PDS ShadowCam archive', **info},
            'caveats': ['Observed image of terrain lit only by light scattered from nearby sunlit slopes; brightness is not albedo.',
                        'Covers only part of this crop (the Shackleton interior); no image exists elsewhere and none is substituted.',
                        'ShadowCam is designed for permanently shadowed terrain; outside the shadow, sunlit pixels may be saturated or sparse, so only the shadowed interior is meaningful.',
                        'Mosaic is controlled by the ShadowCam team; registration to this LOLA 5 m mesh is not independently verified here.']}


def main():
    prp, meta = stream_prp()
    print('PRP rows', meta['rowsTotal'], 'kept', meta['rowsKept'], 'sha256', meta['sha256'][:16])
    index = json.loads((WEB / 'index.json').read_text())
    for info in index['sites']:
        sid = info['id']
        (WEB / sid / 'science').mkdir(parents=True, exist_ok=True)
        layers = diviner_layers(sid, prp, meta)
        sc = shadowcam_layer(sid)
        if sc:
            layers.append(sc)
        manifest = {'version': 1, 'siteId': sid, 'generated': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'layers': layers,
                    'notChecked': 'LEND, Mini-RF, M3 and CRaTER are not integrated; see docs/MILESTONE8_ACCEPTANCE.md'}
        (WEB / sid / 'science' / 'index.json').write_text(json.dumps(manifest, indent=1))
        print(sid, [(l['id'], round(l['validPct'], 1), l['min'], l['max']) for l in layers])


if __name__ == '__main__':
    main()
