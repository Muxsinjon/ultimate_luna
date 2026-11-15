"""Fetch Sun & Earth directions in the Moon body-fixed frame (MOON_ME) from JPL Horizons.

Query: target = Moon (301), observer = Earth geocenter (500@399), quantities
  14 = observer (Earth) sub-point on the Moon  -> direction Moon->Earth in MOON_ME
  15 = Sun sub-point on the Moon               -> direction Moon->Sun  in MOON_ME
  19 = r  (Sun-Moon distance, km)
  20 = delta (Earth-Moon distance, km)

From these the web app computes topocentric azimuth/elevation of the Sun and
Earth for ANY lunar surface coordinate, entirely in the browser.

Output (web/public/data/):
  ephem.bin  float32 little-endian, N rows x 6: [Ex, Ey, Ez (km), Sx, Sy, Sz (unit)]
  ephem.json metadata (start epoch, step, count, source)
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
START_YEAR, END_YEAR = 2023, 2032  # [start, end) -> hourly samples
STEP_H = 1
SHIP_STEP_H = 6


def fetch_chunk(start: str, stop: str) -> list[tuple[datetime, float, float, float, float, float, float]]:
    params = {
        "format": "text",
        "COMMAND": "'301'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'500@399'",
        "START_TIME": f"'{start}'",
        "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": f"'{STEP_H}h'",
        "QUANTITIES": "'14,15,19,20'",
        "CSV_FORMAT": "'YES'",
        "RANGE_UNITS": "'KM'",
        "ANG_FORMAT": "'DEG'",
        "OBJ_DATA": "'NO'",
        "TIME_DIGITS": "'MINUTES'",
    }
    for attempt in range(4):
        try:
            r = requests.get(API, params=params, timeout=300)
            r.raise_for_status()
            text = r.text
            break
        except requests.RequestException as e:  # retry transient failures
            print(f"  retry {attempt + 1}: {e}")
            time.sleep(5 * (attempt + 1))
    else:
        raise RuntimeError(f"Horizons failed for {start}..{stop}")

    if "$$SOE" not in text:
        raise RuntimeError(text[:2000])
    body = text.split("$$SOE")[1].split("$$EOE")[0]
    rows = []
    for line in body.strip().splitlines():
        c = [x.strip() for x in line.split(",")]
        t = datetime.strptime(c[0], "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc)
        e_lon, e_lat, s_lon, s_lat = map(float, c[3:7])
        r_sun = float(c[7])
        d_earth = float(c[9])
        rows.append((t, e_lon, e_lat, d_earth, s_lon, s_lat, r_sun))
    return rows


def unit(lon_deg: np.ndarray, lat_deg: np.ndarray) -> np.ndarray:
    lon, lat = np.radians(lon_deg), np.radians(lat_deg)
    return np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], axis=-1)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for y in range(START_YEAR, END_YEAR):
        # Each chunk is [Jan 1 00:00, Dec 31 23:00] so chunks don't overlap.
        print(f"Fetching {y} ...")
        rows += fetch_chunk(f"{y}-01-01 00:00", f"{y}-12-31 23:00")

    t = [r[0] for r in rows]
    # sanity: strictly hourly, no gaps
    dt = np.diff([x.timestamp() for x in t])
    assert np.all(dt == STEP_H * 3600), "gap or duplicate in ephemeris time series"

    a = np.array([r[1:] for r in rows], dtype=np.float64)
    earth = unit(a[:, 0], a[:, 1]) * a[:, 2:3]  # km, MOON_ME
    sun = unit(a[:, 3], a[:, 4])  # unit vector, MOON_ME
    data = np.concatenate([earth, sun], axis=1).astype("<f4")
    (Path(__file__).resolve().parent / "out" / "ephem_hourly.bin").write_bytes(data.tobytes())  # full resolution, used by the Python pipeline
    # The web app downloads every SHIP_STEP_H-th row (6x smaller) and rebuilds the hourly series
    # by interpolation (upsampleEphemeris in web/src/lib/ephemeris.ts; error < 0.001 deg).
    (OUT / "ephem.bin").write_bytes(data[::SHIP_STEP_H].tobytes())

    meta = {
        "startUtc": t[0].isoformat().replace("+00:00", "Z"),
        "startMs": int(t[0].timestamp() * 1000),
        "stepMs": STEP_H * 3600 * 1000,
        "count": len(rows),
        "shipStepH": SHIP_STEP_H,
        "shipCount": len(data[::SHIP_STEP_H]),
        "columns": ["earth_x_km", "earth_y_km", "earth_z_km", "sun_x", "sun_y", "sun_z"],
        "frame": "MOON_ME (IAU mean-Earth/polar-axis, east-longitude positive)",
        "moonRadiusKm": 1737.4,
        "sunRadiusKm": 695700.0,
        "earthRadiusKm": 6371.0,
        "meanSunDistanceKm": float(np.mean(a[:, 5])),
        "source": "NASA/JPL Horizons API (DE441): target 301, center 500@399, quantities 14,15,19,20",
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (OUT / "ephem.json").write_text(json.dumps(meta, indent=2))
    print(f"Wrote {len(rows)} rows ({data.nbytes / 1e6:.1f} MB) to {OUT}")


if __name__ == "__main__":
    main()
