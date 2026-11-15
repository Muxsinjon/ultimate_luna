"""Terrain horizon masks from NASA LRO/LOLA topography.

For each site we cast rays every 0.5° of azimuth out to MAX_KM over the LOLA
DEM (75S polar stereographic 240 m/px where available, global 16 px/deg
elsewhere), place every sample on the curved Moon in 3D, and keep the highest
elevation angle seen from an observer standing OBS_HEIGHT_M above the surface.

Outputs (web/public/data/):
  sites.json             curated sites + 720-value horizon masks
  dem_polar.bin/.json    south polar DEM downsampled for in-browser custom sites
  dem_global.bin/.json   global DEM downsampled for in-browser custom sites
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from lunar_geom import R_MOON_KM, enu_basis, unit
from sites import SITES

RAW = Path(__file__).resolve().parent / "raw"
OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
AZ_STEP = 0.5
MAX_KM = 250.0
OBS_HEIGHT_M = 2.0
R_M = R_MOON_KM * 1000


class PolarDEM:
    """LDEM_75S_240M: polar stereographic, centre -90, true scale at pole."""

    def __init__(self, path=RAW / "LDEM_75S_240M.IMG", n=3812, scale=240.0, offset=1905.5, min_lat=-75.0):
        self.h = np.fromfile(path, dtype="<i2").reshape(n, n).astype(np.float32) * 0.5
        self.n, self.scale, self.offset, self.min_lat = n, scale, offset, min_lat

    def covers(self, lat):
        return lat <= self.min_lat + 0.3

    def sample(self, lat, lon):
        rho = 2 * R_M * np.tan(np.pi / 4 + np.radians(lat) / 2)
        x = rho * np.sin(np.radians(lon))
        y = rho * np.cos(np.radians(lon))
        col = self.offset + x / self.scale - 0.5  # 0-based fractional pixel centre
        row = self.offset - y / self.scale - 0.5
        return bilinear(self.h, row, col)


class GlobalDEM:
    """LDEM_16: simple cylindrical, 16 px/deg, line 0 at 90N, sample 0 at 0E."""

    def __init__(self, path=RAW / "LDEM_16.IMG", ppd=16):
        self.ppd = ppd
        self.h = np.fromfile(path, dtype="<i2").reshape(180 * ppd, 360 * ppd).astype(np.float32) * 0.5

    def sample(self, lat, lon):
        row = (90.0 - lat) * self.ppd - 0.5
        col = (np.mod(lon, 360.0)) * self.ppd - 0.5
        return bilinear(self.h, row, col, wrap_cols=True)


def bilinear(img, row, col, wrap_cols=False):
    h, w = img.shape
    r0 = np.clip(np.floor(row).astype(int), 0, h - 2)
    fr = np.clip(row - r0, 0, 1)
    if wrap_cols:
        c0 = np.floor(col).astype(int) % w
        c1 = (c0 + 1) % w
        fc = col - np.floor(col)
    else:
        c0 = np.clip(np.floor(col).astype(int), 0, w - 2)
        c1 = c0 + 1
        fc = np.clip(col - c0, 0, 1)
    a = img[r0, c0] * (1 - fc) + img[r0, c1] * fc
    b = img[r0 + 1, c0] * (1 - fc) + img[r0 + 1, c1] * fc
    return a * (1 - fr) + b * fr


class Terrain:
    def __init__(self):
        self.polar = PolarDEM()
        self.globe = GlobalDEM()

    def height(self, lat, lon):
        lat = np.asarray(lat, dtype=np.float64)
        lon = np.asarray(lon, dtype=np.float64)
        out = self.globe.sample(lat, lon)
        m = self.polar.covers(lat)
        if np.any(m):
            out = np.where(m, self.polar.sample(lat, lon), out)
        return out


def destination(lat, lon, az, dist_km):
    """Great-circle destination on the sphere. All angles in degrees."""
    p1, l1, th = np.radians(lat), np.radians(lon), np.radians(az)
    d = dist_km / R_MOON_KM
    p2 = np.arcsin(np.sin(p1) * np.cos(d) + np.cos(p1) * np.sin(d) * np.cos(th))
    l2 = l1 + np.arctan2(np.sin(th) * np.sin(d) * np.cos(p1), np.cos(d) - np.sin(p1) * np.sin(p2))
    return np.degrees(p2), (np.degrees(l2) + 180) % 360 - 180


def horizon_mask(terrain: Terrain, lat: float, lon: float):
    polar = terrain.polar.covers(lat)
    step = 0.24 if polar else 1.0
    dists = np.arange(step, MAX_KM + step, step)
    az = np.arange(0, 360, AZ_STEP)
    A, D = np.meshgrid(az, dists, indexing="ij")
    plat, plon = destination(lat, lon, A, D)
    ph = terrain.height(plat, plon)  # metres

    site_h = float(terrain.height(np.array([lat]), np.array([lon]))[0])
    s = unit(lon, lat) * (R_M + site_h + OBS_HEIGHT_M)
    p = unit(plon, plat) * (R_M + ph)[..., None]
    v = p - s
    _, _, up = enu_basis(lon, lat)
    el = np.degrees(np.arcsin((v @ up) / np.linalg.norm(v, axis=-1)))
    mask = el.max(axis=1)
    far = dists[el.argmax(axis=1)]
    return mask, site_h, far


def export_browser_dems(terrain: Terrain):
    # Polar: 240 m -> 960 m (block mean), covers 75S-90S
    f = 4
    h = terrain.polar.h
    n = (h.shape[0] // f) * f
    pol = h[:n, :n].reshape(n // f, f, n // f, f).mean(axis=(1, 3))
    (OUT / "dem_polar.bin").write_bytes(np.round(pol).astype("<i2").tobytes())
    (OUT / "dem_polar.json").write_text(json.dumps({
        "type": "polar-stereographic-south", "n": pol.shape[0], "scaleM": 240.0 * f,
        "offsetPx": pol.shape[0] / 2, "minLat": -75.0, "units": "m above 1737.4 km sphere",
        "source": "LRO LOLA LDEM_75S_240M (PDS LOLA GDR), block-averaged x4",
    }))
    # Global: 16 ppd -> 4 ppd
    g = terrain.globe.h
    gl = g.reshape(g.shape[0] // 4, 4, g.shape[1] // 4, 4).mean(axis=(1, 3))
    (OUT / "dem_global.bin").write_bytes(np.round(gl).astype("<i2").tobytes())
    (OUT / "dem_global.json").write_text(json.dumps({
        "type": "simple-cylindrical", "ppd": 4, "rows": gl.shape[0], "cols": gl.shape[1],
        "units": "m above 1737.4 km sphere", "source": "LRO LOLA LDEM_16 (PDS LOLA GDR), block-averaged x4",
    }))
    print(f"browser DEMs: polar {pol.shape} global {gl.shape}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    terrain = Terrain()
    out = []
    for s in SITES:
        mask, site_h, far = horizon_mask(terrain, s["lat"], s["lon"])
        hi = int(mask.argmax())
        print(f"{s['id']:22s} elev {site_h:7.0f} m  horizon max {mask.max():5.2f}° @ az {hi * AZ_STEP:5.1f} "
              f"({far[hi]:.0f} km away), min {mask.min():5.2f}°")
        out.append({**s, "lon": round(s["lon"] % 360.0, 6), "verify": s.get("verify", False), "elevationM": round(site_h),
                    "horizon": [round(float(x), 3) for x in mask],
                    # distance (km) of the terrain that sets the horizon at each azimuth (for "what blocks the Sun")
                    "horizonDistKm": [round(float(x), 2) for x in far]})
    meta = {
        "azStepDeg": AZ_STEP, "maxDistanceKm": MAX_KM, "observerHeightM": OBS_HEIGHT_M,
        "terrain": "LRO LOLA LDEM_75S_240M (polar) + LDEM_16 (global), NASA PDS",
        "sites": out,
    }
    (OUT / "sites.json").write_text(json.dumps(meta, separators=(",", ":")))
    export_browser_dems(terrain)


if __name__ == "__main__":
    main()
