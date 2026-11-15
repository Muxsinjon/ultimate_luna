"""Milestone 5: what does hourly sampling miss? Bounded-error statement for sunlight and Earth line of sight.

For every curated polar planner site (lat <= -75), terrain-aware visibility (upper limb above the planner's 240 m
horizon mask, same rule as the app) is evaluated at 10-minute steps over 2023-2031 (Horizons hourly vectors,
linear inside the hour as in the browser) and compared with the app's hourly half-open samples.
Reported per site and overall: share-of-time difference, visible/hidden periods shorter than 1 h that the hourly
samples miss entirely, and transition timing differences.

  python sampling_bound.py   ->  docs/data/MILESTONE5_SAMPLING_BOUND.json
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from lunar_geom import DATA, R_MOON_KM, az_el, unit

ROOT = Path(__file__).resolve().parent.parent
SUB = 6  # 10-minute steps
SUN_R = 0.2666


def runs(flags: np.ndarray):
    """(start, length) of maximal runs of True."""
    d = np.diff(np.concatenate([[0], flags.astype(np.int8), [0]]))
    s, e = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
    return s, e - s


def main():
    eph = np.frombuffer((ROOT / 'pipeline/out/ephem_hourly.bin').read_bytes(), '<f4').reshape(-1, 6).astype(np.float64)
    n = len(eph)
    w = (np.arange((n - 1) * SUB) % SUB) / SUB
    i = np.arange((n - 1) * SUB) // SUB
    fine = eph[i] * (1 - w)[:, None] + eph[i + 1] * w[:, None]
    fine[:, 3:] /= np.linalg.norm(fine[:, 3:], axis=1, keepdims=True)
    sites = json.loads((DATA / 'sites.json').read_text())
    step = sites['azStepDeg']
    out, agg = [], {'sun': [], 'earth': []}
    for s in sites['sites']:
        if s['lat'] > -75:
            continue
        mask = np.array(s['horizon'])
        az_grid = np.arange(len(mask)) * step
        hz = lambda az: np.interp(az, np.append(az_grid, 360), np.append(mask, mask[0]))
        pos = unit(s['lon'], s['lat']) * (R_MOON_KM + s['elevationM'] / 1000)
        row = {'id': s['id'], 'name': s['name']}
        for body in ('sun', 'earth'):
            if body == 'sun':
                az, el = az_el(fine[:, 3:], s['lon'], s['lat'])
                rad = SUN_R
            else:
                ev = fine[:, :3] - pos
                az, el = az_el(ev, s['lon'], s['lat'])
                rad = np.degrees(np.arcsin(6371.0 / np.linalg.norm(ev, axis=1)))
            vis = el - hz(az) + rad > 0  # 10-minute truth (upper limb)
            hourly = vis[::SUB]  # the app's samples (hour starts), each covering the next hour
            approx = np.repeat(hourly, SUB)[: len(vis)]
            missed = []
            skip = set()
            for flags, label in ((vis, 'visible'), (~vis, 'hidden')):
                st, ln = runs(flags)
                short = ln < SUB
                # a run is missed when it contains no hour-start sample
                contains = ((st + ln - 1) // SUB) > ((st - 1) // SUB) if len(st) else np.array([], bool)
                miss = short & ~contains
                skip.update((st[miss]).tolist())
                skip.update((st[miss] + ln[miss]).tolist())
                missed.append({'state': label, 'runsShorterThan1h': int(short.sum()), 'missedRuns': int(miss.sum()),
                               'missedMaxMinutes': int(ln[miss].max() * 10) if miss.any() else 0,
                               'missedTotalHours': float(ln[miss].sum() * 10 / 60)})
            # transition timing: each 10-min transition vs the hourly series' nearest transition
            t_f = np.flatnonzero(np.diff(vis.astype(np.int8)) != 0) + 1
            t_f = np.array([t for t in t_f if t not in skip], dtype=int)  # edges of missed runs are counted above
            t_h = (np.flatnonzero(np.diff(hourly.astype(np.int8)) != 0) + 1) * SUB
            if len(t_f) and len(t_h):
                j = np.clip(np.searchsorted(t_h, t_f), 1, len(t_h) - 1)
                dt = np.minimum(abs(t_h[j] - t_f), abs(t_h[j - 1] - t_f)) * 10
            else:
                dt = np.array([0])
            row[body] = {
                'pctTime10min': float(100 * vis.mean()), 'pctTimeHourly': float(100 * hourly.mean()),
                'pctDifference': float(100 * (approx.mean() - vis.mean())), 'disagreementPctOfTime': float(100 * (approx != vis).mean()),
                'transitions10min': int(len(t_f)), 'transitionsHourly': int(len(t_h)),
                'transitionOffsetMinutes': {'p50': float(np.median(dt)), 'p95': float(np.percentile(dt, 95)), 'max': float(dt.max())},
                'missed': missed,
            }
            agg[body].append(row[body])
        out.append(row)
        print(s['id'], {b: (round(row[b]['pctDifference'], 2), [m['missedRuns'] for m in row[b]['missed']]) for b in ('sun', 'earth')})
    summary = {}
    for body, rows in agg.items():
        summary[body] = {
            'maxAbsPctDifference': max(abs(r['pctDifference']) for r in rows),
            'maxDisagreementPctOfTime': max(r['disagreementPctOfTime'] for r in rows),
            'missedRunsTotal': sum(m['missedRuns'] for r in rows for m in r['missed']),
            'missedLongestMinutes': max(m['missedMaxMinutes'] for r in rows for m in r['missed']),
            'transitionOffsetMaxMinutes': max(r['transitionOffsetMinutes']['max'] for r in rows),
        }
    rep = {'method': __doc__.strip().splitlines()[0], 'period': '2023-01-01 to 2031-12-31 (10-minute vs hourly)', 'terrain': 'planner 240 m horizon masks',
           'summary': summary, 'sites': out}
    (ROOT / 'docs/data/MILESTONE5_SAMPLING_BOUND.json').write_text(json.dumps(rep, indent=1))
    print(json.dumps(summary, indent=1))


if __name__ == '__main__':
    main()
