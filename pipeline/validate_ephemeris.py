"""Validate our in-app geometry against JPL Horizons' own topocentric az/el.

For several lunar sites, ask Horizons for apparent Az/El of the Sun (10) and
Earth (399) as seen from a surface observer (CENTER='coord@301'), then compare
with what our compact ephemeris + geometry predicts. Writes a JSON report the
web app can show ("validated against JPL Horizons").
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import numpy as np
import requests

from lunar_geom import DATA, Ephemeris

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
SITES = {
    "Near south pole (89.5S, 0E)": (0.0, -89.5),
    "Mons Mouton area (84.5S, 30E)": (30.0, -84.5),
    "Chandrayaan-3 (69.37S, 32.32E)": (32.32, -69.37),
    "Apollo 11 (0.67N, 23.47E)": (23.47, 0.67),
    "Far side (45S, 177.6E)": (177.6, -45.0),
}
START, STOP, STEP = "2026-11-01", "2026-12-01", "6h"


def horizons_azel(target: str, lon: float, lat: float):
    p = {
        "format": "text", "COMMAND": f"'{target}'", "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'", "COORD_TYPE": "'GEODETIC'", "SITE_COORD": f"'{lon % 360},{lat},0'",
        "START_TIME": f"'{START}'", "STOP_TIME": f"'{STOP}'", "STEP_SIZE": f"'{STEP}'",
        "QUANTITIES": "'4'", "CSV_FORMAT": "'YES'", "ANG_FORMAT": "'DEG'", "OBJ_DATA": "'NO'",
    }
    t = requests.get(API, params=p, timeout=120).text
    body = t.split("$$SOE")[1].split("$$EOE")[0]
    out = []
    for line in body.strip().splitlines():
        c = [x.strip() for x in line.split(",")]
        ts = datetime.strptime(c[0], "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc)
        out.append((ts, float(c[3]), float(c[4])))
    return out


def ang_diff(a, b):
    return (np.asarray(a) - np.asarray(b) + 180) % 360 - 180


def main():
    eph = Ephemeris()
    report = {"period": f"{START} to {STOP} every {STEP}", "sites": []}
    for name, (lon, lat) in SITES.items():
        res = {"site": name}
        for label, target, idx in (("sun", "10", (0, 1)), ("earth", "399", (2, 3))):
            ref = horizons_azel(target, lon, lat)
            ours = [eph.sun_earth_azel(ts, lon, lat) for ts, _, _ in ref]
            del_el = np.array([o[idx[1]] - r[2] for o, r in zip(ours, ref)])
            # azimuth error only meaningful away from zenith
            del_az = np.array([ang_diff(o[idx[0]], r[1]) for o, r in zip(ours, ref)])
            del_az = del_az[np.array([abs(r[2]) < 80 for r in ref])]
            res[label] = {
                "maxElevErrDeg": round(float(np.max(np.abs(del_el))), 4),
                "rmsElevErrDeg": round(float(np.sqrt(np.mean(del_el ** 2))), 4),
                "maxAzErrDeg": round(float(np.max(np.abs(del_az))), 4) if len(del_az) else None,
                "samples": len(ref),
            }
        report["sites"].append(res)
        print(name, res["sun"], res["earth"])
    worst = max(max(s["sun"]["maxElevErrDeg"], s["earth"]["maxElevErrDeg"]) for s in report["sites"])
    report["worstElevationErrorDeg"] = worst
    path = DATA / "validation.json"
    if path.exists():  # keep other sections (illumination, missions)
        report = {**json.loads(path.read_text()), **report}
    path.write_text(json.dumps(report, indent=2))
    print("worst elevation error (deg):", worst)


if __name__ == "__main__":
    main()
