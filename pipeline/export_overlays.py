"""Downsample the PGDA long-term average Sun / Earth visibility maps (Mazarico et
al. 2011, 120 m/px, 75S-90S) onto the 960 m browser polar grid as uint8 percent
(255 = no data). Same polar-stereographic extent as LDEM_75S_240M.
"""
from pathlib import Path

import numpy as np
import rasterio

RAW = Path(__file__).resolve().parent / "raw"
OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "data"
F = 8  # 120 m * 8 = 960 m

for key, name in (("sun", "AVGVISIB_75S_120M_201608.TIF"), ("earth", "AVGVISIB_75S_120M_201608_EARTH.TIF")):
    with rasterio.open(RAW / name) as ds:
        assert abs(ds.transform.c + 457440) < 1 and ds.width == 7624, "unexpected PGDA grid"
        a = ds.read(1).astype(np.float32)
        nod = a == ds.nodata
        a = a * ds.scales[0] * 100.0
        a[nod] = np.nan
    n = a.shape[0] // F
    b = np.nanmean(a[: n * F, : n * F].reshape(n, F, n, F), axis=(1, 3))
    u8 = np.where(np.isnan(b), 255, np.clip(np.round(b), 0, 100)).astype(np.uint8)
    (OUT / f"pgda_{key}.bin").write_bytes(u8.tobytes())
    print(key, u8.shape, "mean %", float(np.nanmean(b)))
