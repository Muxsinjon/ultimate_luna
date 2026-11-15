"""Real-mission sanity check: Chandrayaan-3 (Aug-Sep 2023).

Public record (ISRO / press): landed 2023-08-23 ~12:34 UTC shortly after local
sunrise; Pragyan put to sleep Sep 2 and Vikram ~Sep 4 08:00 IST (02:30 UTC)
"ahead of the lunar night"; next sunrise / wake-up attempt Sep 22.
We report what our terrain-aware model predicts for the same site.
"""
import json
from datetime import datetime, timedelta, timezone

import numpy as np

from lunar_geom import DATA, SUN_RADIUS_DEG, Ephemeris

SITE_ID = "chandrayaan-3"
LANDING = datetime(2023, 8, 23, 12, 34, tzinfo=timezone.utc)


def main():
    eph = Ephemeris()
    meta = json.loads((DATA / "sites.json").read_text())
    s = next(x for x in meta["sites"] if x["id"] == SITE_ID)
    mask = np.array(s["horizon"])
    step = meta["azStepDeg"]

    def margin(t):
        saz, sel, _, _ = eph.sun_earth_azel(t, s["lon"], s["lat"], s["elevationM"] / 1000)
        f = saz / step
        i = int(f) % len(mask)
        w = f - int(f)
        # upper limb: sunrise/sunset when the top of the disc crosses the terrain horizon
        return sel - (mask[i] * (1 - w) + mask[(i + 1) % len(mask)] * w) + SUN_RADIUS_DEG, sel

    events = []
    t = datetime(2023, 8, 15, tzinfo=timezone.utc)
    prev = margin(t)[0]
    while t < datetime(2023, 10, 1, tzinfo=timezone.utc):
        t2 = t + timedelta(minutes=10)
        m = margin(t2)[0]
        if (m > 0) != (prev > 0):
            events.append({"event": "sunrise" if m > 0 else "sunset", "utc": t2.isoformat()[:16] + "Z"})
        t, prev = t2, m
    m_land, el_land = margin(LANDING)
    out = json.loads((DATA / "validation.json").read_text())
    out["missions"] = [{
        "mission": "Chandrayaan-3 (ISRO), 69.373 S 32.319 E",
        "predicted": events,
        "sunAtLandingDeg": round(el_land, 2),
        "record": "Landed 2023-08-23 12:34 UTC; Vikram put to sleep ~2023-09-04 02:30 UTC ahead of local sunset "
                  "(reported ~Sep 4-5); wake-up attempted from the next sunrise, announced as Sep 22.",
    }]
    (DATA / "validation.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out["missions"], indent=2))


if __name__ == "__main__":
    main()
