"""Cross-check our terrain-aware sunlit / Earth-visible fractions with the LOLA
team's published average-illumination maps (Mazarico et al. 2011, PGDA).

Ours: 2023-2031 hourly ephemeris + 240 m horizon masks.
Theirs: 18.6-year hourly average, 120 m/px (AVGVISIB_75S_120M_201608*).
Agreement within ~10 percentage points is expected given the different
period, resolution and observer height.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio

from lunar_geom import DATA, R_MOON_KM, az_el, disc_fraction_above, unit

PGDA = "https://pgda.gsfc.nasa.gov/data/MoonIllumination/"
FILES = {"sun": "AVGVISIB_75S_120M_201608.TIF", "earth": "AVGVISIB_75S_120M_201608_EARTH.TIF"}
SUN_R_DEG = 0.2666



def main():
    eph = np.frombuffer((Path(__file__).resolve().parent / "out" / "ephem_hourly.bin").read_bytes(), dtype="<f4").reshape(-1, 6).astype(np.float64)
    earth, sun = eph[:, :3], eph[:, 3:]
    sites = json.loads((DATA / "sites.json").read_text())
    step = sites["azStepDeg"]
    rows = []
    srcs = {k: rasterio.open(Path(__file__).resolve().parent / "raw" / f) for k, f in FILES.items()}
    print("PGDA CRS:", srcs["sun"].crs.to_string()[:120])
    for s in sites["sites"]:
        if s["lat"] > -75:
            continue
        lat, lon = s["lat"], s["lon"]
        mask = np.array(s["horizon"])
        saz, sel = az_el(sun, lon, lat)
        site = unit(lon, lat) * (R_MOON_KM + s["elevationM"] / 1000)
        e_vec = earth - site
        eaz, eel = az_el(e_vec, lon, lat)
        e_rad = np.degrees(np.arcsin(6371.0 / np.linalg.norm(e_vec, axis=1)))
        hs = mask[(np.round(saz / step).astype(int)) % len(mask)]
        he = mask[(np.round(eaz / step).astype(int)) % len(mask)]
        ours_sun = float(np.mean(disc_fraction_above(sel - hs, SUN_R_DEG)))
        ours_earth = float(np.mean(eel - he > -e_rad))  # any part of disc visible (PGDA convention)

        rho = 2 * R_MOON_KM * 1000 * np.tan(np.pi / 4 + np.radians(lat) / 2)
        x, y = rho * np.sin(np.radians(lon)), rho * np.cos(np.radians(lon))
        ref = {}
        for k, ds in srcs.items():
            v = next(ds.sample([(x, y)]))[0]
            scale = ds.scales[0] if ds.scales and ds.scales[0] not in (0, 1) else 1
            ref[k] = float(v) * scale
        # PGDA stores fraction either 0..1 or 0..100
        ref = {k: (v / 100 if v > 1.5 else v) for k, v in ref.items()}
        row = {"site": s["name"], "oursSunPct": round(100 * ours_sun, 1), "pgdaSunPct": round(100 * ref["sun"], 1),
               "oursEarthPct": round(100 * ours_earth, 1), "pgdaEarthPct": round(100 * ref["earth"], 1)}
        rows.append(row)
        print(row)
    out = json.loads((DATA / "validation.json").read_text())
    out["illumination"] = {
        "reference": "LOLA average visibility maps, Mazarico et al. (2011) Icarus 211, PGDA 75S 120 m (2016)",
        "note": "ours: 2023-2031 hourly, 240 m horizon masks, 2 m observer; PGDA: 18.6-yr average at 120 m",
        "sites": rows,
    }
    (DATA / "validation.json").write_text(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
