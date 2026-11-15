"""Render the Open Graph image (1200x630) and PNG favicons from hand-written SVG.

Original artwork: the real LOLA horizon silhouette of Nobile Rim 2 with the Sun on the ridge.
No agency logos and no image-generator output; the drawing code was written with AI assistance, which the image states visibly. Requires `playwright` (Chromium).
"""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "web" / "public"
sites = json.loads((PUB / "data" / "sites.json").read_text())
site = next(s for s in sites["sites"] if s["id"] == "nobile-rim-2")
mask = site["horizon"]

W, H = 1200, 630
lo, hi = -4.0, 12.0
top, bottom = 150, 560


def y(el):
    return top + (hi - el) / (hi - lo) * (bottom - top)


pts = " ".join(f"{i / len(mask) * W:.1f},{y(h):.1f}" for i, h in enumerate(mask))
terrain = f"M0,{H} L{pts} L{W},{y(mask[0]):.1f} L{W},{H} Z"
# Real Sun and Earth positions at Nobile Rim 2 on 2026-11-22 00:40 UTC (3 h before the ridge sunset)
from datetime import datetime, timezone  # noqa: E402

from lunar_geom import Ephemeris  # noqa: E402

s_az, s_el, e_az, e_el = Ephemeris().sun_earth_azel(
    datetime(2026, 11, 22, 0, 40, tzinfo=timezone.utc), site["lon"], site["lat"], site["elevationM"] / 1000
)
sun_x, sun_y = s_az / 360 * W, y(s_el)
earth_x, earth_y = e_az / 360 * W, y(e_el)

og = f"""<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600&family=Barlow:wght@400;500&display=swap" rel="stylesheet">
<style>html,body{{margin:0;width:{W}px;height:{H}px;background:#0d1220;overflow:hidden}}
h1{{position:absolute;left:64px;top:56px;margin:0;font:600 64px 'Barlow Semi Condensed';color:#ece9e2;letter-spacing:.005em}}
p{{position:absolute;left:66px;top:136px;margin:0;font:400 28px Barlow;color:#a9a69e;max-width:760px}}
.f{{position:absolute;left:66px;bottom:34px;font:500 22px Barlow;color:#ece9e2}}</style></head><body>
<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" style="position:absolute;inset:0">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070b"/><stop offset="1" stop-color="#05070b"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5e5a53"/><stop offset="1" stop-color="#2e2c29"/></linearGradient></defs>
<rect width="{W}" height="{H}" fill="url(#s)"/>
<line x1="0" x2="{W}" y1="{y(0):.1f}" y2="{y(0):.1f}" stroke="#ece9e2" stroke-opacity=".28" stroke-dasharray="6 6"/>
<circle cx="{sun_x:.1f}" cy="{sun_y:.1f}" r="16" fill="#f0a830"/>
<circle cx="{earth_x:.1f}" cy="{earth_y:.1f}" r="20" fill="#5ab0f0"/>
<path d="{terrain}" fill="url(#g)" stroke="#9a948a" stroke-width="2"/>
</svg>
<h1>LunaWindow</h1>
<p>Find the right place and time to land on the Moon: sunlight and Earth visibility from JPL Horizons and real LRO LOLA terrain.</p>
<div class="f">Real LOLA horizon of Nobile Rim 2 with the computed Sun and Earth, 2026-11-22 00:40 UTC (vertical scale exaggerated). Rendered by AI-assisted code; not a NASA image.</div>
</body></html>"""

icon = (PUB / "favicon.svg").read_text()

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": W, "height": H})
    pg.set_content(og, wait_until="networkidle")
    pg.screenshot(path=str(PUB / "og-image.png"))
    for size, name in ((32, "favicon-32.png"), (180, "apple-touch-icon.png")):
        pg = b.new_page(viewport={"width": size, "height": size})
        sized = icon.replace("<svg ", '<svg width="%d" height="%d" ' % (size, size))
        pg.set_content("<html><body style='margin:0;background:transparent'>" + sized + "</body></html>")
        pg.screenshot(path=str(PUB / name), omit_background=True)
    b.close()
print("wrote og-image.png, favicon-32.png, apple-touch-icon.png")
