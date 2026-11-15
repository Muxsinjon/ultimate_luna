"""Milestone 3 dual-site 3D terrain comparison acceptance (rendered build).

Usage: python tests/e2e/terrain_compare_test.py [base_url] [--screenshots DIR]
Checks: two independent 3D views (Site04 vs Site06), linked/unlinked cameras, shared thresholds, equal-footprint
comparison table cross-checked against an independent Python count on the shipped native layers, insufficient-data
handling, no stale values after switching sites, navigation that keeps sites, mobile layout and clean console.
"""
import argparse, json, math, os, re, time
from pathlib import Path
import numpy as np
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / 'web/public/data/terrain'
R = 1737400.0
p = argparse.ArgumentParser()
p.add_argument('base', nargs='?', default='http://localhost:4173/')
p.add_argument('--screenshots', type=Path, default=ROOT / 'pipeline/out/terrain-screenshots')
a = p.parse_args()
a.screenshots.mkdir(parents=True, exist_ok=True)


def polar_xy(lat, lon):
    la, lo = math.radians(lat), math.radians(lon)
    k = 2 * R * math.tan(math.pi / 4 + la / 2)
    return k * math.sin(lo), k * math.cos(lo)


def independent_footprint(site_id, lat, lon, elev, radius, max_slope, max_rough):
    """Re-implements the published footprint rule in numpy: sample centres within the scale-corrected radius."""
    m = json.loads((WEB / site_id / 'hazards/hazards.json').read_text())
    s = np.frombuffer((WEB / site_id / 'hazards/slope.u16').read_bytes(), '<u2').reshape(m['height'], m['width'])
    g = np.frombuffer((WEB / site_id / 'hazards/roughness.u16').read_bytes(), '<u2').reshape(m['height'], m['width'])
    x, y = polar_xy(lat, lon)
    scale = 2 / (1 + math.sin(-math.radians(lat))) * R / (R + elev)  # stereographic scale k at this latitude / height
    rr = radius * scale
    cols = m['x0'] + np.arange(m['width']) * m['dx']
    rows = m['y0'] + np.arange(m['height']) * m['dy']
    inside = (cols[None, :] - x) ** 2 + (rows[:, None] - y) ** 2 <= rr ** 2
    sv, gv = s[inside], g[inside]
    valid = (sv != m['noData']) & (gv != m['noData'])
    meets = valid & (sv * m['quantum'] <= max_slope) & (gv * m['quantum'] <= max_rough)
    return int(inside.sum()), int(valid.sum()), int(meets.sum())


with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, executable_path=os.environ.get('CHROMIUM') or None, args=['--enable-unsafe-swiftshader'])
    page = b.new_page(viewport={'width': 1440, 'height': 1000})
    errors, failures, console = [], [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('requestfailed', lambda r: failures.append((r.url, r.failure)))
    page.on('console', lambda m: console.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
    page.goto(a.base + '#ui=full&ws=terrain&a=shackleton-rim-site04&b=nobile-rim-1-site06&sv=A')
    expect(page.get_by_test_id('slope-method-warning')).to_be_visible(timeout=30000)  # single view fully loaded first
    t0 = time.time()
    page.get_by_role('radio', name='Compare A and B').click()
    pa, pb = page.get_by_test_id('terrain-pane-A'), page.get_by_test_id('terrain-pane-B')
    expect(pa).to_have_attribute('data-site-id', 'site04')
    expect(pb).to_have_attribute('data-site-id', 'site06')
    expect(pa.locator('canvas')).to_be_visible(timeout=30000)
    expect(pb.locator('canvas')).to_be_visible(timeout=30000)
    table = page.get_by_test_id('terrain-comparison')
    expect(table).not_to_contain_text('Loading', timeout=30000)
    dual_load_s = time.time() - t0
    page.screenshot(path=str(a.screenshots / 'terrain-compare.png'), full_page=True)

    # Equal footprint cross-check against the independent numpy count (default radius 100 m, 10°, 0.3 m)
    idx = {t['id']: t for t in json.loads((WEB / 'index.json').read_text())['sites']}
    row = lambda label: table.locator('tr', has=page.locator('th', has_text=label))
    for col, sid in ((1, 'site04'), (2, 'site06')):
        terr = json.loads((WEB / sid / 'terrain.json').read_text())
        c = idx[sid]['centre']
        centre_text = pa if sid == 'site04' else pb
        elev = float(re.search(r'([-\d.]+) m elevation', centre_text.get_by_test_id(re.compile('footprint-centre')).inner_text()).group(1))
        total, valid, meets = independent_footprint(sid, c['lat'], c['lon'], elev, 100, 10, 0.3)
        cell = row('Valid 5 m samples / selected').locator('td').nth(col - 1).inner_text()
        got = tuple(int(n) for n in re.match(r'(\d+) / (\d+)', cell).groups())
        assert abs(got[0] - valid) <= 2 and abs(got[1] - total) <= 2, (sid, got, valid, total)
        meet_cell = row('Meets both criteria').locator('td').nth(col - 1).inner_text()
        got_meets = int(re.search(r'\((\d+) samples\)', meet_cell).group(1))
        assert abs(got_meets - meets) <= 2, (sid, got_meets, meets)
        assert abs(total - math.pi * 20 ** 2) / (math.pi * 20 ** 2) < 0.1, total
        assert terr['siteId'] == sid
    expect(page.get_by_test_id('terrain-tradeoffs')).to_contain_text('not a landing-safety assessment')

    # Linked cameras share the offset from the target (same scale and orientation); unlinked views are independent
    offset = lambda pane: (lambda v: np.array(v[:3]) - np.array(v[3:]))(json.loads(pane.locator('canvas').get_attribute('data-camera')))
    page.get_by_role('button', name='Site A: Rotate right').click()
    page.get_by_role('button', name='Site A: Zoom in').click()
    assert np.allclose(offset(pa), offset(pb), atol=1e-3), (offset(pa), offset(pb))
    page.get_by_label('Link cameras (same scale and viewing direction)').uncheck()
    before = offset(pb)
    page.get_by_role('button', name='Site A: Rotate right').click()
    assert np.allclose(offset(pb), before) and not np.allclose(offset(pa), before)

    # Shared thresholds drive both sites; an impossible threshold makes neither meet and says so
    page.get_by_label('Overlay layer').select_option('hazard')
    expect(pa.locator('canvas')).to_have_attribute('data-analysis-layer', 'hazard')
    expect(pb.locator('canvas')).to_have_attribute('data-analysis-layer', 'hazard')
    page.get_by_label('Shared maximum slope').fill('0')
    expect(page.get_by_test_id('terrain-tradeoffs')).to_contain_text('Neither footprint meets')
    page.get_by_label('Shared maximum slope').fill('')
    expect(row('Screening result')).to_contain_text('Insufficient data')
    page.get_by_label('Shared maximum slope').fill('10')

    # Switching Site B terrain replaces every value (no stale Site06 numbers)
    old = row('Footprint centre').locator('td').nth(1).inner_text()
    page.get_by_label('Site B terrain').select_option('site01')
    expect(pb).to_have_attribute('data-site-id', 'site01')
    expect(table.locator('thead')).to_contain_text('Connecting Ridge')
    expect(table).not_to_contain_text('Loading', timeout=30000)
    assert row('Footprint centre').locator('td').nth(1).inner_text() != old
    assert 'Site01' in row('Terrain product').locator('td').nth(1).inner_text()

    # A planner site without processed terrain is insufficient data, never ranked
    page.get_by_label('Site B', exact=True).select_option('apollo-11')
    expect(pb).to_contain_text('No processed 5 m terrain')
    expect(row('Screening result').locator('td').nth(1)).to_have_text('Insufficient data')
    expect(page.get_by_test_id('terrain-tradeoffs')).to_contain_text('not ranked')
    page.get_by_label('Site B terrain').select_option('site06')

    # Navigation keeps both sites
    page.get_by_role('button', name='Mission windows for these sites').click()
    expect(page).to_have_url(re.compile(r'ws=finder.*a=shackleton-rim-site04.*b=nobile-rim-1-site06'))
    page.get_by_role('button', name='3D Terrain', exact=True).click()
    page.get_by_role('radio', name='Compare A and B').click()
    expect(pb).to_have_attribute('data-site-id', 'site06')
    page.get_by_role('button', name='Sun and Earth charts for these sites').click()
    expect(page).to_have_url(re.compile(r'ws=compare.*a=shackleton-rim-site04.*b=nobile-rim-1-site06'))

    # Responsive: stacked panes, no horizontal overflow
    page.get_by_role('button', name='3D Terrain', exact=True).click()
    page.get_by_role('radio', name='Compare A and B').click()
    page.set_viewport_size({'width': 390, 'height': 844})
    expect(pb.locator('canvas')).to_be_visible(timeout=30000)
    expect(table).not_to_contain_text('Loading', timeout=30000)
    page.screenshot(path=str(a.screenshots / 'terrain-compare-mobile.png'), full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), 'Mobile overflow'
    boxes = [pa.bounding_box(), pb.bounding_box()]
    assert boxes[1]['y'] >= boxes[0]['y'] + boxes[0]['height'] - 1, boxes

    assert not errors, errors
    local = [f for f in failures if f[0].startswith(a.base)]
    assert not local, local
    driver = [m for m in console if m[0] == 'warning' and 'GPU stall due to ReadPixels' in m[1]]
    unexpected = [m for m in console if m not in driver]
    assert not unexpected, unexpected
    print(f'PASS dual 3D views, linked/unlinked cameras, shared thresholds, equal-footprint table vs independent numpy count, '
          f'insufficient data, no stale values, navigation, mobile. Dual load {dual_load_s:.1f} s (software renderer)')
    b.close()
