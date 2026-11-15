"""Milestone 8 rendered check: optional science layers on the 3D terrain view.

Usage: python tests/e2e/science_test.py [base_url]
Checks the layer toggle, model vs observation labels, legend and units, opacity, layer switching, the point readout
against an independent decode of the shipped file, ShadowCam only where observed, and the off state restoring the
previous overlay path.
"""
import json, math, re, sys
from pathlib import Path
import numpy as np
from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
ROOT = Path(__file__).resolve().parents[2]
W = ROOT / 'web/public/data/terrain'
R = 1737400.0


def expected_at_site(sid, lid, lat, lon):
    idx = json.loads((W / sid / 'science/index.json').read_text())
    m = next(l for l in idx['layers'] if l['id'] == lid)
    q = np.frombuffer((W / sid / 'science' / m['file']).read_bytes(), '<u2').reshape(m['height'], m['width'])
    t = json.loads((W / sid / 'terrain.json').read_text())
    la, lo = math.radians(lat), math.radians(lon)
    k = 2 * R * math.tan(math.pi / 4 + la / 2)
    c = round((k * math.sin(lo) - t['x0']) / t['dx'])
    r = round((k * math.cos(lo) - t['y0']) / t['dy'])
    v = int(q[round(r / m['stride']), round(c / m['stride'])])
    return m, v * m['scale']


sites = {s['id']: s for s in json.loads((ROOT / 'web/public/data/sites.json').read_text())['sites']}

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--enable-unsafe-swiftshader'])
    page = b.new_page(viewport={'width': 1440, 'height': 1000})
    console = []
    page.on('console', lambda m: console.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: console.append(('pageerror', str(e))))
    page.goto(BASE + '#ui=full&ws=terrain&a=shackleton-rim-site04&b=connecting-ridge&sv=A')
    canvas = page.locator('.terrain-canvas canvas')
    expect(canvas).to_be_visible(timeout=30000)
    sel = page.get_by_role('combobox', name='Science layer', exact=True)
    expect(sel).to_be_visible(timeout=20000)
    opts = sel.locator('option').all_inner_texts()
    assert any('ShadowCam' in o for o in opts), opts  # observed imagery exists for Shackleton
    # model-derived temperature: label, legend, unit, readout equals the shipped file at the site vertex
    sel.select_option('diviner-tmax')
    meta = page.get_by_test_id('science-meta')
    expect(meta).to_have_attribute('data-kind', 'model')
    expect(meta).to_contain_text('Model-derived')
    expect(meta).to_contain_text('first mapping year')
    expect(meta).to_contain_text('K')
    expect(canvas).to_have_attribute('data-analysis-layer', 'science', timeout=20000)
    s4 = sites['shackleton-rim-site04']
    m, want = expected_at_site('site04', 'diviner-tmax', s4['lat'], s4['lon'])
    txt = page.get_by_test_id('science-point').inner_text()
    got = float(re.search(r'([\d.]+) K', txt).group(1))
    assert abs(got - want) <= 0.05, (got, want)
    # opacity slider changes the overlay; switching layers replaces metadata (no stale values)
    page.get_by_label('Layer opacity').fill('0.4')
    expect(page.get_by_text(re.compile(r'Layer opacity \(40 %\)'))).to_be_visible()
    sel.select_option('diviner-ice')
    expect(meta).to_have_attribute('data-layer', 'diviner-ice')
    expect(meta).to_contain_text('not evidence that ice is there')
    expect(meta).to_contain_text('not interpreted')
    sel.select_option('shadowcam-if')
    expect(meta).to_have_attribute('data-kind', 'observation')
    expect(meta).to_contain_text('scattered from nearby sunlit slopes')
    # off restores the analysis overlay path
    sel.select_option('off')
    expect(canvas).to_have_attribute('data-analysis-layer', 'elevation')
    # Nobile Rim 1: Diviner only, no ShadowCam (none observed there)
    page.get_by_label('Site A terrain').select_option('site06')
    expect(page.get_by_role('combobox', name='Science layer', exact=True)).to_be_visible(timeout=30000)
    expect(page.get_by_role('combobox', name='Science layer', exact=True).locator('option', has_text='ShadowCam')).to_have_count(0, timeout=20000)
    page.get_by_role('combobox', name='Science layer', exact=True).select_option('diviner-tavg')
    s6 = sites['nobile-rim-1-site06']
    m6, want6 = expected_at_site('site06', 'diviner-tavg', s6['lat'], s6['lon'])
    expect(page.get_by_test_id('science-point')).to_contain_text(f'{want6:.1f} K', timeout=20000)
    expect(page.get_by_text('never combined into a score')).to_be_visible()
    bad = [m for m in console if not ('GPU stall due to ReadPixels' in m[1])]
    assert not bad, bad
    print(f'PASS science layers: Diviner Tmax at Shackleton site {got} K (file {want:.2f} K), Nobile Tavg {want6:.1f} K, '
          'model/observation labels, legend, opacity, switching, ShadowCam only where observed, off state')
    b.close()
