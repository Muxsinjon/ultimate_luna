"""Milestone 4: independent check of Sun/Earth topocentric geometry against JPL Horizons.

Horizons reference (fetched once, stored as a fixture with the exact request parameters):
  observer  CENTER='coord@301', COORD_TYPE='GEODETIC', SITE_COORD='<E lon>,<lat>,0' (IAU lunar sphere, 1737.4 km)
  targets   Sun '10' (quantities 4,13) and Earth '399' (quantities 4,10,13,20)
  times     TLIST of UT Julian dates: coverage edges, UTC date changes, off-hour minutes, a seeded random spread

Ours: the browser code path reproduced exactly, i.e. the *shipped* 6-hourly ephem.bin upsampled to hourly
(lerp Earth, nlerp Sun), then linear interpolation inside the hour, then ENU az/el at the site. The Vitest
test web/src/lib/astronomy.test.ts re-runs the same fixture through the TypeScript code.

  python validate_astronomy.py --fetch     # query Horizons, write the reference fixture (network)
  python validate_astronomy.py             # compare and write docs/data/MILESTONE4_ASTRONOMY_VALIDATION.json
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'web/public/data'
FIXTURE = ROOT / 'web/src/lib/__fixtures__/horizons_topocentric.json'
REPORT = ROOT / 'docs/data/MILESTONE4_ASTRONOMY_VALIDATION.json'
API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
R_MOON = 1737.4
R_EARTH = 6371.0
SUN_RADIUS_DEG = 0.2666

# (id, east lon as sent to Horizons, lat). Two entries describe the same place with 0-360 and -180..180 longitude.
SITES = [
    ('connecting-ridge', 209.94767, -89.53432),
    ('connecting-ridge-negative-lon', -150.05233, -89.53432),
    ('shackleton-rim-site04', 188.10719, -89.76674),
    ('nobile-rim-1-site06', 37.36812, -85.43812),
    ('near-south-pole', 45.0, -89.99),
    ('near-north-pole', 300.0, 89.9),
    ('apollo-11', 23.47298, 0.67409),
    ('far-side', 177.5991, -45.4446),
    ('prime-meridian-wrap', 359.995, -30.0),
]


def jd(t: datetime) -> float:
    return t.timestamp() / 86400.0 + 2440587.5


def times() -> list[datetime]:
    u = lambda *a: datetime(*a, tzinfo=timezone.utc)
    t = [u(2023, 1, 1, 0, 0), u(2023, 1, 1, 0, 30), u(2023, 1, 1, 5, 59), u(2031, 12, 31, 22, 0), u(2031, 12, 31, 22, 59)]
    t += [u(2027, 6, 30, 23, 0), u(2027, 6, 30, 23, 45), u(2027, 7, 1, 0, 0), u(2027, 7, 1, 0, 15)]  # UTC date change
    t += [u(2028, 2, 28, 23, 50), u(2028, 2, 29, 0, 10), u(2028, 12, 31, 23, 59)]  # leap day, year change
    rng = np.random.default_rng(20261115)
    start, span = u(2023, 1, 1, 1, 0).timestamp(), (u(2031, 12, 31, 22, 0) - u(2023, 1, 1, 1, 0)).total_seconds()
    for s in np.sort(rng.uniform(0, span, 28)):
        t.append(datetime.fromtimestamp(start + round(s / 60) * 60, tz=timezone.utc))  # whole minutes, any hour
    return sorted(t)


def fetch():
    import requests

    ts = times()
    out = {'source': 'NASA/JPL Horizons API', 'api': API, 'fetched': datetime.now(timezone.utc).isoformat(timespec='seconds'),
           'times': [t.isoformat().replace('+00:00', 'Z') for t in ts], 'sites': []}
    for sid, lon, lat in SITES:
        rec = {'id': sid, 'lon': lon, 'lat': lat}
        for body, target, q in (('sun', '10', '4,13'), ('earth', '399', '4,10,13,20')):
            params = {
                'format': 'text', 'COMMAND': f"'{target}'", 'EPHEM_TYPE': "'OBSERVER'", 'CENTER': "'coord@301'",
                'COORD_TYPE': "'GEODETIC'", 'SITE_COORD': f"'{lon},{lat},0'", 'TLIST_TYPE': "'JD'", 'TIME_TYPE': "'UT'",
                'TLIST': ' '.join(f"'{jd(t):.8f}'" for t in ts), 'QUANTITIES': f"'{q}'", 'CSV_FORMAT': "'YES'",
                'ANG_FORMAT': "'DEG'", 'OBJ_DATA': "'NO'", 'EXTRA_PREC': "'YES'",
            }
            text = requests.post(API, data=params, timeout=300).text
            if '$$SOE' not in text:
                raise RuntimeError(text[:1500])
            header = text.split('$$SOE')[0].strip().splitlines()[-2]
            rows = [[c.strip() for c in line.split(',')] for line in text.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()]
            if len(rows) != len(ts):
                raise RuntimeError(f'{sid} {body}: {len(rows)} rows for {len(ts)} times')
            cols = [c.strip() for c in header.split(',')]
            col = lambda prefix: next(i for i, c in enumerate(cols) if c.startswith(prefix))
            val = lambda r, name: float(r[col(name)])
            got = [datetime.strptime(r[0], '%Y-%b-%d %H:%M:%S.%f').replace(tzinfo=timezone.utc) for r in rows]
            if max(abs((a - b).total_seconds()) for a, b in zip(got, ts)) > 0.01:
                raise RuntimeError(f'{sid} {body}: Horizons returned different epochs')
            rec[body] = {
                'request': {k: v for k, v in params.items() if k != 'TLIST'},
                'columns': cols,
                'az': [val(r, 'Azi') for r in rows],
                'el': [val(r, 'Elev') for r in rows],
                'angDiamArcsec': [val(r, 'Ang-diam') for r in rows],
            }
            if body == 'earth':
                rec[body]['illuPct'] = [val(r, 'Illu%') for r in rows]
                rec[body]['deltaAu'] = [val(r, 'delta') for r in rows]
            print(sid, body, 'ok', flush=True)
        out['sites'].append(rec)
    FIXTURE.write_text(json.dumps(out, indent=1))
    print('wrote', FIXTURE)


# ---- our browser-equivalent path -------------------------------------------------------------------------
def browser_ephemeris():
    meta = json.loads((DATA / 'ephem.json').read_text())
    ship = np.frombuffer((DATA / 'ephem.bin').read_bytes(), '<f4').reshape(-1, 6)
    f = meta['shipStepH']
    n = len(ship)
    out = np.empty(((n - 1) * f + 1, 6), np.float32)
    ext = np.vstack([2 * ship[0] - ship[1], ship, 2 * ship[-1] - ship[-2]]).astype(np.float64)
    for k in range(f):  # uniform Catmull-Rom, as upsampleEphemeris (Milestone 4)
        t = k / f
        p0, p1, p2, p3 = ext[:-3], ext[1:-2], ext[2:-1], ext[3:]
        v = 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3)
        v[:, 3:] /= np.linalg.norm(v[:, 3:], axis=1, keepdims=True)
        out[k:-1:f] = v
    out[-1] = ship[-1]
    return meta, out.astype(np.float64)


def unit(lon, lat):
    lo, la = np.radians(lon), np.radians(lat)
    return np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])


def az_el(v, lon, lat):
    lo, la = np.radians(lon), np.radians(lat)
    e = np.array([-np.sin(lo), np.cos(lo), 0.0])
    n = np.array([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)])
    u = unit(lon, lat)
    return float(np.degrees(np.arctan2(v @ e, v @ n)) % 360), float(np.degrees(np.arctan2(v @ u, np.hypot(v @ e, v @ n))))


def ours(meta, rows, t: datetime, lon: float, lat: float):
    f = (t.timestamp() * 1000 - meta['startMs']) / meta['stepMs']
    if not 0 <= f <= len(rows) - 1:
        return None  # outside the shipped coverage: the app never extrapolates, so there is nothing to compare
    i = min(int(np.floor(f)), len(rows) - 2)
    w = f - i
    r = rows[i] * (1 - w) + rows[i + 1] * w
    earth, sun = r[:3], r[3:] / np.linalg.norm(r[3:])
    site = unit(lon % 360, lat) * R_MOON
    ev = earth - site
    d = np.linalg.norm(ev)
    # Earth phase: angle at Earth between the Sun and the observer (Sun at the mean distance)
    sun_from_earth = sun * meta['meanSunDistanceKm'] - earth
    cos_phase = (sun_from_earth @ -ev) / (np.linalg.norm(sun_from_earth) * d)
    return {
        'sun': az_el(sun, lon % 360, lat), 'earth': az_el(ev, lon % 360, lat),
        'earthDiamDeg': 2 * np.degrees(np.arcsin(R_EARTH / d)), 'earthLitPct': 100 * (1 + cos_phase) / 2, 'earthKm': d,
    }


def stats(x):
    x = np.abs(np.asarray(x, float))
    return {'n': int(x.size), 'max': float(x.max()), 'p95': float(np.percentile(x, 95)), 'p50': float(np.median(x)), 'rms': float(np.sqrt(np.mean(x ** 2)))}


def compare():
    ref = json.loads(FIXTURE.read_text())
    meta, rows = browser_ephemeris()
    ts = [datetime.fromisoformat(s.replace('Z', '+00:00')) for s in ref['times']]
    err = {k: [] for k in ('sunEl', 'sunAz', 'earthEl', 'earthAz', 'earthDiam', 'earthLitPct', 'sunDiam')}
    per_site = []
    outside = sorted({ref['times'][i] for i, t in enumerate(ts) if ours(meta, rows, t, 0.0, 0.0) is None})
    for s in ref['sites']:
        e_site = {k: [] for k in err}
        for i, t in enumerate(ts):
            o = ours(meta, rows, t, s['lon'], s['lat'])
            if o is None:
                continue
            for body in ('sun', 'earth'):
                daz = (o[body][0] - s[body]['az'][i] + 180) % 360 - 180
                e_site[body + 'El'].append(o[body][1] - s[body]['el'][i])
                if abs(s[body]['el'][i]) < 80:  # azimuth is ill-conditioned near the zenith
                    e_site[body + 'Az'].append(daz * np.cos(np.radians(s[body]['el'][i])))  # on-sky angle
            e_site['earthDiam'].append(o['earthDiamDeg'] - s['earth']['angDiamArcsec'][i] / 3600)
            e_site['earthLitPct'].append(o['earthLitPct'] - s['earth']['illuPct'][i])
            e_site['sunDiam'].append(2 * SUN_RADIUS_DEG - s['sun']['angDiamArcsec'][i] / 3600)
        per_site.append({'id': s['id'], 'lon': s['lon'], 'lat': s['lat'], **{k: stats(v) for k, v in e_site.items() if v}})
        for k in err:
            err[k] += e_site[k]
    wrap = [x for x in ref['sites'] if x['id'].startswith('connecting-ridge')]
    wrap_ref = max(max(abs(a - b) for a, b in zip(wrap[0][body][q], wrap[1][body][q])) for body in ('sun', 'earth') for q in ('az', 'el'))
    report = {
        'generated': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'reference': {'source': ref['source'], 'fetched': ref['fetched'], 'times': len(ts), 'sites': len(ref['sites']),
                      'requests': len(ref['sites']) * 2, 'fixture': str(FIXTURE.relative_to(ROOT)).replace('\\', '/'),
                      'timeList': ref['times']},
        'ourPath': 'shipped 6-hourly ephem.bin -> hourly lerp/nlerp (float32) -> linear in-hour interpolation -> ENU az/el on the 1737.4 km sphere',
        'units': 'degrees, except earthLitPct in percentage points; azimuth errors are on-sky (x cos el), only where |el| < 80 deg',
        'overall': {k: stats(v) for k, v in err.items()},
        'longitudeWrapHorizonsMaxDiffDeg': wrap_ref,
        'coverage': {'startUtc': meta['startUtc'], 'endUtc': datetime.fromtimestamp((meta['startMs'] + (len(rows) - 1) * meta['stepMs']) / 1000, tz=timezone.utc).isoformat().replace('+00:00', 'Z'),
                     'referenceEpochsOutsideCoverage': outside, 'note': 'epochs after the last shipped 6-hourly row are outside coverage; the app returns no values there'},
        'sites': per_site,
    }
    REPORT.write_text(json.dumps(report, indent=1))
    for k, v in report['overall'].items():
        print(f"{k:12s} max {v['max']:.5f}  p95 {v['p95']:.5f}  rms {v['rms']:.5f}  n={v['n']}")
    print('Horizons 0-360 vs +-180 longitude max difference:', wrap_ref)
    return report


def interpolation_error():
    """Shipped-and-upsampled vs the full hourly Horizons series, across all of 2023-2031."""
    meta, up = browser_ephemeris()
    full = np.frombuffer((ROOT / 'pipeline/out/ephem_hourly.bin').read_bytes(), '<f4').reshape(-1, 6).astype(np.float64)
    n = min(len(full), len(up))
    ang = lambda a, b: np.degrees(np.arccos(np.clip(np.sum(a * b, 1) / np.linalg.norm(a, axis=1) / np.linalg.norm(b, axis=1), -1, 1)))
    sun = ang(up[:n, 3:], full[:n, 3:])
    earth_dir = ang(up[:n, :3], full[:n, :3])
    return {'hours': int(n), 'sunMaxDeg': float(sun.max()), 'sunP95Deg': float(np.percentile(sun, 95)),
            'earthDirMaxDeg': float(earth_dir.max()), 'earthDirP95Deg': float(np.percentile(earth_dir, 95)),
            'earthRangeMaxKm': float(np.abs(np.linalg.norm(up[:n, :3], axis=1) - np.linalg.norm(full[:n, :3], axis=1)).max())}


if __name__ == '__main__':
    if '--fetch' in sys.argv:
        fetch()
    rep = compare()
    if (ROOT / 'pipeline/out/ephem_hourly.bin').exists():
        rep['interpolationVsFullHourly'] = interpolation_error()
        print('interpolation', rep['interpolationVsFullHourly'])
        REPORT.write_text(json.dumps(rep, indent=1))
