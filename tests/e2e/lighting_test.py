"""Milestone 5 rendered check: time-dependent terrain sunlight / Earth line of sight and the static PSR layer.

Usage: python tests/e2e/lighting_test.py [base_url]
"""
import json, re, sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
ROOT = Path(__file__).resolve().parents[2]
psr_frac = json.loads((ROOT / 'web/public/data/terrain/site04/illumination/illumination.json').read_text())['psrFraction']

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--enable-unsafe-swiftshader'])
    page = b.new_page(viewport={'width': 1440, 'height': 1000})
    console, failures = [], []
    page.on('console', lambda m: console.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: console.append(('pageerror', str(e))))
    page.on('requestfailed', lambda r: failures.append(r.url))
    page.goto(BASE + '#ui=full&ws=terrain&a=shackleton-rim-site04&b=connecting-ridge&sv=A&t=2027-01-01T00:00:00Z&d=14&at=2027-01-05T12:00:00Z')
    canvas = page.locator('.terrain-canvas canvas')
    expect(canvas).to_be_visible(timeout=30000)
    page.get_by_label('Lighting layer').select_option('sunlight')
    stats = page.get_by_test_id('lighting-stats')
    expect(stats).to_be_visible(timeout=30000)
    expect(canvas).to_have_attribute('data-analysis-layer', 'sunlight')
    a = float(stats.get_attribute('data-sun-any')); f = float(stats.get_attribute('data-sun-full'))
    assert 0 <= f <= a <= 100, (a, f)
    pt = page.get_by_test_id('lighting-point')
    assert 0 <= float(pt.get_attribute('data-sun-frac')) <= 1
    # time slider changes the computed lighting (shared state)
    before = stats.get_attribute('data-sun-any')
    for _ in range(6):
        page.get_by_role('button', name='Next hour').click()
    expect(stats).not_to_have_attribute('data-sun-any', before, timeout=15000)
    # Earth layer + disclaimer
    page.get_by_label('Lighting layer').select_option('earth')
    expect(canvas).to_have_attribute('data-analysis-layer', 'earth')
    expect(page.get_by_text('not a radio link budget', exact=False).first).to_be_visible()
    # static PSR context, labelled as such, matching the shipped NASA sample
    page.get_by_label('Lighting layer').select_option('psr')
    expect(page.get_by_test_id('psr-stats')).to_contain_text(f'{100 * psr_frac:.1f} %')
    expect(page.get_by_test_id('psr-stats')).to_contain_text('not a prediction for the selected date')
    # off restores the hazard analysis overlay path
    page.get_by_label('Lighting layer').select_option('off')
    expect(canvas).to_have_attribute('data-analysis-layer', 'elevation')
    # compare mode: both sites computed for the same instant
    page.get_by_role('radio', name='Compare A and B').click()
    page.get_by_label('Lighting layer').select_option('sunlight')
    expect(page.get_by_test_id('lighting-stats-A')).to_be_visible(timeout=40000)
    expect(page.get_by_test_id('lighting-stats-B')).to_be_visible(timeout=40000)
    # sunlight definitions in the comparison table
    page.get_by_role('button', name='Sun and Earth charts for these sites').click()
    expect(page.get_by_role('row', name=re.compile('Full Sun disc visible'))).to_be_visible(timeout=20000)
    expect(page.get_by_role('row', name=re.compile('Only part of the Sun visible'))).to_be_visible()
    bad = [m for m in console if not (m[0] == 'warning' and 'GPU stall due to ReadPixels' in m[1])]
    assert not bad, bad
    assert not [u for u in failures if u.startswith(BASE)], failures
    print(f'PASS sunlight/Earth/PSR layers, time slider, compare mode, sunlight definitions (inner sunlit {a:.1f} %, full disc {f:.1f} %)')
    b.close()
