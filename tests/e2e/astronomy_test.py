"""Milestone 4 rendered check: Sun/Earth readouts in the 3D terrain view and Surface View vs JPL Horizons.

Usage: python tests/e2e/astronomy_test.py [base_url]
Reference: web/src/lib/__fixtures__/horizons_topocentric.json (Horizons coord@301 topocentric, quantities 4 and 10).
"""
import json, re, sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
ROOT = Path(__file__).resolve().parents[2]
ref = json.loads((ROOT / 'web/src/lib/__fixtures__/horizons_topocentric.json').read_text())
T = '2027-07-01T00:00:00Z'
i = ref['times'].index(T)
cr = next(s for s in ref['sites'] if s['id'] == 'connecting-ridge')
wrap = lambda d: (d + 180) % 360 - 180

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--enable-unsafe-swiftshader'])
    page = b.new_page(viewport={'width': 1440, 'height': 1000})
    console = []
    page.on('console', lambda m: console.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: console.append(('pageerror', str(e))))
    page.goto(BASE + f'#ui=full&ws=terrain&a=connecting-ridge&sv=A&t={T}&d=14&at={T}')
    sky = page.get_by_test_id('sky-readout')
    expect(sky).to_be_visible(timeout=30000)
    got = {k: float(sky.get_attribute(f'data-{k}')) for k in ('sun-az', 'sun-el', 'earth-az', 'earth-el')}
    assert abs(got['sun-el'] - cr['sun']['el'][i]) < 0.002, got
    assert abs(wrap(got['sun-az'] - cr['sun']['az'][i])) < 0.002, got
    assert abs(got['earth-el'] - cr['earth']['el'][i]) < 0.007, got
    assert abs(wrap(got['earth-az'] - cr['earth']['az'][i])) < 0.007, got
    canvas = page.locator('.terrain-canvas canvas')
    expect(canvas).to_have_attribute('data-sun-dir', re.compile(r'^\['), timeout=30000)
    sun = json.loads(canvas.get_attribute('data-sun-dir'))  # mesh frame: X east, Y up, Z south at the crop origin
    import math
    assert abs(math.degrees(math.asin(sun[1])) - cr['sun']['el'][i]) < 0.01, sun  # site is the crop origin for Site01
    # time slider moves the readout (shared state)
    page.get_by_role('button', name='Next hour').click()
    expect(sky).not_to_have_attribute('data-sun-az', str(got['sun-az']))
    # Surface View shows the Earth phase from the same instant
    page.goto(BASE + f'#ui=full&ws=surface&a=connecting-ridge&sv=A&t={T}&d=14&at={T}')
    txt = page.get_by_text(re.compile(r'of Earth.s disc sunlit')).inner_text()
    lit = float(re.search(r'(\d+)\s*%\s*of Earth', txt).group(1))
    assert abs(lit - cr['earth']['illuPct'][i]) <= 0.6, (lit, cr['earth']['illuPct'][i])
    assert re.search(r'apparent diameter [12]\.\d\d°', txt), txt
    # out-of-range request is clamped with an explanation, never extrapolated
    page.goto(BASE + '#ui=full&ws=compare&a=connecting-ridge&t=2035-01-01T00:00:00Z&d=14')
    page.wait_for_timeout(500)
    assert '2035' not in page.url, page.url
    bad = [m for m in console if not (m[0] == 'warning' and 'GPU stall due to ReadPixels' in m[1])]
    assert not bad, bad
    print(f'PASS 3D sky readout and rays vs Horizons ({got}), time slider, Surface View Earth phase {lit}% vs {cr["earth"]["illuPct"][i]:.2f}%, out-of-range clamp')
    b.close()
