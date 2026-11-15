"""Milestone 7: first-person surface view on the 5 m terrain (rendered checks, software renderer).

Usage: python tests/e2e/surface3d_test.py [base_url] [--screenshots DIR]
Checks: Sun/Earth bearings vs the Horizons fixture (Milestone 4), pixel probe that the rendered Sun disc is visible
when the horizon calculation says so and hidden by terrain when it does not, look-at buttons, walking, date changes,
unsupported WebXR path, coverage fallback, load-error path, mobile layout, clean console.
"""
import argparse, json, re
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
p = argparse.ArgumentParser()
p.add_argument('base', nargs='?', default='http://localhost:4173/')
p.add_argument('--screenshots', type=Path, default=ROOT / 'pipeline/out/surface3d-screenshots')
a = p.parse_args()
a.screenshots.mkdir(parents=True, exist_ok=True)
ref = json.loads((ROOT / 'web/src/lib/__fixtures__/horizons_topocentric.json').read_text())
T = '2027-07-01T00:00:00Z'
i = ref['times'].index(T)
cr = next(s for s in ref['sites'] if s['id'] == 'connecting-ridge')
wrap = lambda d: (d + 180) % 360 - 180
PROBE = """([x, y]) => { const c = document.querySelector('[data-testid=first-person] canvas'); const t = document.createElement('canvas');
 t.width = c.width; t.height = c.height; const g = t.getContext('2d'); g.drawImage(c, 0, 0); return Array.from(g.getImageData(x, y, 1, 1).data) }"""

with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=['--enable-unsafe-swiftshader'])
    page = b.new_page(viewport={'width': 1440, 'height': 1000})
    console = []
    page.on('console', lambda m: console.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: console.append(('pageerror', str(e))))
    page.goto(a.base + f'#ui=full&ws=surface&a=connecting-ridge&sv=A&fp=1&t={T}&d=14&at={T}')
    sky = page.get_by_test_id('fp-sky')
    expect(sky).to_have_attribute('data-sun-frac', re.compile(r'.'), timeout=60000)
    canvas = page.locator('[data-testid=first-person] canvas')
    # bearings agree with JPL Horizons topocentric values (site 1.7 m above the 20 m mesh vs Horizons on the sphere)
    got = {k: float(sky.get_attribute(f'data-{k}')) for k in ('sun-az', 'sun-el', 'earth-az', 'earth-el')}
    assert abs(got['sun-el'] - cr['sun']['el'][i]) < 0.01 and abs(wrap(got['sun-az'] - cr['sun']['az'][i])) < 0.01, got
    assert abs(got['earth-el'] - cr['earth']['el'][i]) < 0.02 and abs(wrap(got['earth-az'] - cr['earth']['az'][i])) < 0.02, got
    # look at Earth: view direction = Earth bearing; the Earth disc is drawn at screen centre
    v0 = canvas.get_attribute('data-view')
    page.get_by_role('button', name='Look at Earth').click()
    expect(canvas).not_to_have_attribute('data-view', v0)
    view = json.loads(canvas.get_attribute('data-view'))
    assert abs(wrap(view[0] - got['earth-az'])) < 0.01 and abs(view[1] - got['earth-el']) < 0.01, view
    epx = json.loads(canvas.get_attribute('data-earth-px'))
    w, h = page.evaluate("() => { const c = document.querySelector('[data-testid=first-person] canvas'); return [c.width, c.height] }")
    assert abs(epx[0] - w / 2) <= 2 and abs(epx[1] - h / 2) <= 2, (epx, w, h)
    page.screenshot(path=str(a.screenshots / 'surface3d-earth.png'), full_page=True)

    # Shackleton Rim crater wall, 2027-01-05 12:00 UTC: Sun above 0° but hidden by the 5 m terrain (computed 0 %)
    def sun_pixel(site, at):
        page.goto(a.base + f'#ui=full&ws=surface&a={site}&sv=A&fp=1&t={at[:10]}T00:00Z&d=14&at={at}')
        page.reload()
        expect(sky).to_have_attribute('data-sun-frac', re.compile(r'.'), timeout=60000)
        page.get_by_label('Surface overlay').select_option('none')
        page.get_by_role('button', name='Look at the Sun').click()
        page.wait_for_timeout(500)
        px = json.loads(canvas.get_attribute('data-sun-px'))
        return float(sky.get_attribute('data-sun-frac')), float(sky.get_attribute('data-sun-el')), page.evaluate(PROBE, px)

    sun_rgb = page.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--c-sun').trim()")
    tgt = [int(sun_rgb[k:k + 2], 16) for k in (1, 3, 5)]
    close = lambda c: max(c[:3]) > 150  # the drawn Sun (white-hot disc and glare) is far brighter than any terrain pixel
    frac, el, rgb = sun_pixel('shackleton-rim-site04', '2027-01-05T12:00:00Z')
    assert el > 0 and frac == 0, (el, frac)
    assert not close(rgb), ('Sun drawn although terrain hides it', rgb)
    page.screenshot(path=str(a.screenshots / 'surface3d-sun-hidden.png'), full_page=True)
    frac2, el2, rgb2 = sun_pixel('connecting-ridge', '2026-11-22T01:00:00Z')
    assert frac2 == 1 and close(rgb2), ('visible Sun not drawn', frac2, rgb2)
    page.screenshot(path=str(a.screenshots / 'surface3d-sun-visible.png'), full_page=True)
    # time slider moves the Sun; walking moves the observer on the terrain
    before = sky.get_attribute('data-sun-az')
    page.get_by_role('button', name='Next hour').click()
    expect(sky).not_to_have_attribute('data-sun-az', before)
    pos = page.get_by_text(re.compile(r'Position: ')).inner_text()
    canvas.focus()
    for _ in range(4):
        page.keyboard.press('Shift+w')
    expect(page.get_by_text(re.compile(r'Position: '))).not_to_have_text(pos)
    expect(page.get_by_role('button', name='Return to the site location')).to_be_visible()
    # WebXR: unsupported in headless Chromium, so the desktop view is the full experience
    expect(page.get_by_test_id('xr-status')).to_have_attribute('data-xr', 'no')
    # horizon profile overlay and realism limits are present
    expect(page.get_by_test_id('horizon-profile')).to_be_visible()
    expect(page.get_by_text('Realism limits of this view')).to_be_visible()
    # coverage fallback: no 5 m terrain at Apollo 11
    page.goto(a.base + '#ui=full&ws=surface&a=apollo-11&sv=A&fp=1')
    page.reload()
    expect(page.get_by_test_id('fp-unavailable')).to_be_visible(timeout=20000)
    expect(page.get_by_role('radio', name='3D first person (5 m terrain)')).to_be_disabled()
    expect(page.get_by_role('radio', name='360° horizon panorama')).to_be_checked()
    # load-error path: missing horizon inputs are reported, not hidden
    page.route('**/site01/illumination/illumination.json', lambda r: r.fulfill(status=404, body='missing'))
    page.goto(a.base + f'#ui=full&ws=surface&a=connecting-ridge&sv=A&fp=1&t={T}&d=14&at={T}')
    page.reload()
    expect(page.get_by_role('alert').filter(has_text='Horizon inputs could not be loaded')).to_be_visible(timeout=40000)
    page.unroute('**/site01/illumination/illumination.json')
    # mobile
    page.set_viewport_size({'width': 390, 'height': 844})
    page.reload()
    expect(sky).to_have_attribute('data-sun-frac', re.compile(r'.'), timeout=60000)
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'), 'Mobile overflow'
    page.screenshot(path=str(a.screenshots / 'surface3d-mobile.png'), full_page=True)
    bad = [m for m in console if not ('GPU stall due to ReadPixels' in m[1] or ('404' in m[1] and m[0] == 'error'))]
    assert not bad, bad
    print(f'PASS first-person view: bearings vs Horizons {got}, Earth centred after look-at, Sun hidden by terrain '
          f'(el {el:.2f}°, computed 0 %) and visible (computed 100 %), time, walking, no-XR path, fallback, error path, mobile')
    b.close()
