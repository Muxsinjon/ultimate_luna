"""Shared lunar geometry (mirrors web/src/lib/geometry.ts).

Frame: MOON_ME body-fixed, east-longitude positive, sphere R = 1737.4 km.
Azimuth: degrees clockwise from local north. Elevation: degrees above the
local *geometric* horizon plane (terrain handled separately by horizon masks).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

R_MOON_KM = 1737.4
SUN_RADIUS_DEG = 0.2666
R_EARTH_KM = 6371.0
DATA = Path(__file__).resolve().parent.parent / "web" / "public" / "data"


def unit(lon_deg, lat_deg):
    lon, lat = np.radians(lon_deg), np.radians(lat_deg)
    return np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], axis=-1)


def enu_basis(lon_deg: float, lat_deg: float):
    lon, lat = np.radians(lon_deg), np.radians(lat_deg)
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.array([-np.sin(lat) * np.cos(lon), -np.sin(lat) * np.sin(lon), np.cos(lat)])
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    return east, north, up


def az_el(vec: np.ndarray, lon_deg: float, lat_deg: float):
    """vec: (..., 3) topocentric vectors in MOON_ME. Returns az, el in degrees."""
    e, n, u = enu_basis(lon_deg, lat_deg)
    ve, vn, vu = vec @ e, vec @ n, vec @ u
    az = np.degrees(np.arctan2(ve, vn)) % 360.0
    el = np.degrees(np.arctan2(vu, np.hypot(ve, vn)))
    return az, el


class Ephemeris:
    def __init__(self, data_dir: Path = DATA):
        self.meta = json.loads((data_dir / "ephem.json").read_text())
        raw = np.frombuffer((Path(__file__).resolve().parent / "out" / "ephem_hourly.bin").read_bytes(), dtype="<f4")
        self.rows = raw.reshape(-1, 6).astype(np.float64)
        self.start_ms = self.meta["startMs"]
        self.step_ms = self.meta["stepMs"]

    def at(self, t: datetime):
        """Linear interpolation of Earth (km) and Sun (unit) vectors at UTC time t."""
        f = (t.timestamp() * 1000 - self.start_ms) / self.step_ms
        i = int(np.floor(f))
        if not 0 <= i < len(self.rows) - 1:
            raise ValueError(f"{t} outside ephemeris range")
        w = f - i
        r = self.rows[i] * (1 - w) + self.rows[i + 1] * w
        return r[:3], r[3:] / np.linalg.norm(r[3:])

    def sun_earth_azel(self, t: datetime, lon_deg: float, lat_deg: float, alt_km: float = 0.0):
        earth, sun = self.at(t)
        site = unit(lon_deg, lat_deg) * (R_MOON_KM + alt_km)
        saz, sel = az_el(sun, lon_deg, lat_deg)  # Sun parallax from 1737 km is ~0.0007 deg
        eaz, eel = az_el(earth - site, lon_deg, lat_deg)
        return float(saz), float(sel), float(eaz), float(eel)


def utc(s: str) -> datetime:
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


def disc_fraction_above(margin_deg, radius_deg):
    """Fraction of a disc's area above the horizon (circular segment). Mirrors web discFractionAbove."""
    x = np.clip(np.asarray(margin_deg, dtype=float) / radius_deg, -1.0, 1.0)
    return 1.0 - (np.arccos(x) - x * np.sqrt(1.0 - x * x)) / np.pi
