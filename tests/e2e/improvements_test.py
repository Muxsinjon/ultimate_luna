"""Regression checks for the audit fixes and the globe → planning → surface workflow.

Usage: CHROMIUM=/usr/bin/chromium python tests/e2e/improvements_test.py [base] [--evidence DIR]
Uses the production build; no external services. Requires Playwright and Chromium.
"""
import argparse
import json
import os
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('base', nargs='?', default='http://localhost:4173/')
parser.add_argument('--evidence', type=Path, default=Path('pipeline/out/improvements'))
a = parser.parse_args()
a.evidence.mkdir(parents=True, exist_ok=True)

def state(page):
    return {k: v[0] for k, v in parse_qs(urlparse(page.url).fragment, keep_blank_values=True).items()}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM') or None, headless=True, args=['--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    external, console = [], []
    context.route(re.compile(r'^https?://(?!localhost|127\.0\.0\.1)'), lambda r: (external.append(r.request.url), r.abort()))
    page = context.new_page()
    page.on('pageerror', lambda e: console.append(str(e)))
    page.on('console', lambda m: console.append(m.text) if m.type in ('error', 'warning') and 'GPU stall due to ReadPixels' not in m.text else None)

    def go(fragment):
        page.goto(a.base + fragment)
        page.reload() # ensure a fresh workspace state, also exercises URL round trips

    def summary():
        page.get_by_role('button', name='Generate mission summary', exact=True).click()
        button = page.get_by_role('button', name='Download JSON', exact=True)
        expect(button).to_be_enabled(timeout=60000)
        with page.expect_download() as dl:
            button.click()
        data = json.loads(Path(dl.value.path()).read_text())
        page.get_by_role('button', name='Close summary', exact=True).click()
        return data

    # Rotating/selecting must not scrub the scientific time. Texture orientation is unit-tested.
    go('#ws=compare&ui=simple')
    globe = page.get_by_test_id('moon-globe').locator('canvas')
    expect(globe).to_have_attribute('data-selected', re.compile('.'), timeout=30000)
    page.get_by_role('button', name='Near side', exact=True).click()
    t = state(page)['at']
    globe.focus()
    page.keyboard.press('Enter')
    expect(page.get_by_test_id('globe-coordinates')).to_contain_text('0.000')
    page.keyboard.press('ArrowRight')
    page.keyboard.press('Enter')
    selected = json.loads(globe.get_attribute('data-selected'))
    assert abs(selected[0]) < .01 and abs(selected[1] - 15) < .01, selected
    assert state(page)['at'] == t
    before = globe.get_attribute('data-selected')
    box = globe.bounding_box()
    page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    page.mouse.down()
    page.mouse.move(box['x'] + box['width'] / 2 + 60, box['y'] + box['height'] / 2, steps=8)
    page.mouse.up()
    assert globe.get_attribute('data-selected') == before, 'drag must not select a new point'
    page.get_by_role('button', name='Use as Site B', exact=True).click()
    expect(page.get_by_label('Site B', exact=True)).to_have_value('custom:0.000000,15.000000', timeout=30000)
    page.reload()
    expect(page.get_by_label('Site B', exact=True)).to_have_value('custom:0.000000,15.000000', timeout=30000)
    assert state(page)['b'] == 'custom:0.000000,15.000000'
    page.get_by_role('button', name='Near side', exact=True).click()
    page.screenshot(path=str(a.evidence / 'dashboard-desktop.png'), full_page=True)
    page.set_viewport_size({'width': 390, 'height': 844})
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
    page.screenshot(path=str(a.evidence / 'dashboard-phone.png'), full_page=True)
    page.set_viewport_size({'width': 1440, 'height': 1000})
    print('PASS globe rotation, keyboard, selection, worker horizon, share reload and mobile layout')

    # Direct globe action must open the real 3D ground, including when simple view is selected.
    page.get_by_role('button', name='Connecting Ridge', exact=True).click()
    page.get_by_role('button', name='View from the surface', exact=True).click()
    canvas = page.get_by_test_id('first-person').locator('canvas')
    expect(canvas).to_have_attribute('data-view', re.compile('.'), timeout=60000)
    expect(page.get_by_test_id('fp-sky')).to_have_attribute('data-sun-frac', re.compile('.'), timeout=60000)
    at = state(page)['at']
    old = canvas.get_attribute('data-view')
    canvas.focus()
    page.keyboard.press('ArrowRight')
    expect(canvas).not_to_have_attribute('data-view', old)
    assert state(page)['at'] == at, 'look keys changed mission time'
    page.keyboard.press('Shift+ArrowLeft')
    assert state(page)['at'] == at
    page.get_by_role('button', name='Look at Earth', exact=True).click()
    before = canvas.evaluate('(c) => ({...c.dataset})')
    for _ in range(2):
        page.get_by_role('button', name=re.compile('Switch to .* theme')).click()
        expect(canvas).to_have_attribute('data-view', before['view'])
        for key in ['data-sun-px', 'data-earth-px', 'data-shadow']:
            expect(canvas).to_have_attribute(key, re.compile('.'))
    page.evaluate('window.scrollTo(0, 0)')
    page.screenshot(path=str(a.evidence / 'surface3d-after-theme.png'), full_page=True)
    print('PASS direct 3D surface entry, isolated look keys and initialized scene after both theme switches')

    # Report/export uses every requirement; uncovered terrain is never a pass.
    go('#ui=full&ws=compare&a=shackleton-rim-site04&b=im-2&d=14&t=2027-01-01T00:00Z&rs=0&re=0&rd=2000&rb=2000&rj=&tr=20,1,100,90')
    data = summary()
    ca, cb = data['requirementChecks']
    terrain = next(c for c in ca['checks'] if c['key'] == 'terrain')
    assert terrain['actual'] == 0 and not terrain['pass'] and ca['status'] != 'meets', ca
    assert cb['status'] == 'insufficient' and cb['reason'], cb
    (a.evidence / 'summary-terrain.json').write_text(json.dumps(data, indent=2))
    print('PASS terrain-failing and uncovered sites in summary and JSON')

    # Every changed scientific input suppresses old results and exports until recalculation.
    go('#ui=full&ws=finder&a=connecting-ridge&b=nobile-rim-1-site06&ss=2027-01-01T00:00Z&se=2027-01-02T00:00Z&d=1&tr=')
    page.get_by_role('radio', name='Site A and B', exact=True).click()
    page.get_by_role('button', name='Find mission windows', exact=True).click()
    rows = page.locator('table.results tbody tr')
    expect(rows.first).to_be_visible(timeout=60000)
    download = page.get_by_role('button', name='Download scenario and results (JSON)', exact=True)
    changes = [
        lambda: page.get_by_label(re.compile('Latest start')).fill('2027-01-03T00:00'),
        lambda: page.get_by_role('radio', name='Geometric 0°', exact=True).click(),
        lambda: page.get_by_label('Candidate start times').select_option('24'),
        lambda: page.get_by_role('radio', name=re.compile(r'All .* listed sites')).click(),
    ]
    for change in changes:
        change()
        expect(page.get_by_text('Search settings changed.', exact=True)).to_be_visible()
        expect(download).to_have_count(0)
        expect(rows).to_have_count(0)
        page.get_by_role('button', name='Recalculate', exact=True).click()
        expect(rows.first).to_be_visible(timeout=60000)
    with page.expect_download() as dl:
        download.click()
    fresh = json.loads(Path(dl.value.path()).read_text())
    assert fresh['inputs']['candidateSpacingH'] == 24 and 'Geometric' in fresh['inputs']['visibilityModel']
    (a.evidence / 'fresh-search.json').write_text(json.dumps(fresh, indent=2))
    print('PASS stale dates, model, cadence and scope cannot be exported or opened')

    go('#ui=full&ws=finder&t=2031-12-30T00:00Z&d=1&at=2031-12-30T00:00Z')
    page.get_by_role('radio', name='30 d', exact=True).click()
    page.get_by_role('button', name='Explore & Compare', exact=True).click()
    data = summary()
    assert data['mission']['endUTC'] <= '2031-12-31T18:00:00.000Z', data['mission']
    assert data['mission']['durationDays'] == 30 and all(data['requirementChecks'])
    (a.evidence / 'coverage.json').write_text(json.dumps(data, indent=2))
    print('PASS Finder duration change clamps the full mission before comparison/export')

    # A real picked terrain point and its criteria transfer together into Finder and shared URL.
    go('#ui=full&ws=terrain&a=connecting-ridge&sv=A&tr=12,0.4,150,80')
    page.get_by_label('Latitude (degrees)', exact=True).fill('-89.534', timeout=60000)
    page.get_by_label('East longitude (degrees)', exact=True).fill('209.948')
    page.get_by_role('button', name='Inspect coordinates', exact=True).click()
    expect(page.get_by_test_id('terrain-readout')).to_have_attribute('data-lat', '-89.534')
    page.get_by_role('button', name='Plan with this footprint and criteria', exact=True).click()
    expect(page.get_by_role('heading', name=re.compile('^Mission Window Finder'))).to_be_visible(timeout=60000)
    assert state(page)['a'] == 'custom:-89.534000,209.948000', state(page)
    assert state(page)['tr'] == '12,0.4,150,80', state(page)
    print('PASS picked footprint and screening criteria reach Finder together')

    go('#ws=surface&a=im-2&sv=A&fp=1')
    expect(page.get_by_test_id('fp-unavailable')).to_be_visible()
    page.get_by_role('button', name='Explore Connecting Ridge in 3D', exact=True).click()
    expect(page.get_by_test_id('first-person').locator('canvas')).to_have_attribute('data-view', re.compile('.'), timeout=60000)
    go('#ws=compare&a=custom:91,0')
    expect(page.get_by_label('Site A', exact=True)).to_have_value('nobile-rim-2', timeout=30000)
    print('PASS unavailable-terrain recovery and malformed shared-location recovery')
    assert not console, console
    assert not external, external
    print('PASS clean console and zero external requests')
    browser.close()
