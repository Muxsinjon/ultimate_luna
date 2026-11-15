"""Milestone 9 release gate: the complete user journey on real data, offline, with evidence captures.

Usage: python tests/e2e/journey_test.py [base_url] [--evidence DIR]
Every request to a non-local host is aborted, so this also proves the app works with NASA/JPL servers unreachable
(all science data is shipped and checksum-verified). Steps follow the Milestone 9 brief:
 1 landing page  2 Site A/B real 3D terrain + overlays  3 equal-footprint screening  4 mission period sunlight/Earth
 5 explainable rankings  6 immersive surface view through time  7 export/share + sources and limitations
Also: accessible names on interactive controls, 390 px layout of every workspace, clean console.
"""
import argparse, json, re
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser()
ap.add_argument('base', nargs='?', default='http://localhost:4173/')
ap.add_argument('--evidence', type=Path, default=ROOT / 'docs/screenshots/demo')
a = ap.parse_args()
a.evidence.mkdir(parents=True, exist_ok=True)
blocked, problems = [], []
ROLES = {'button', 'combobox', 'textbox', 'checkbox', 'radio', 'slider', 'link', 'spinbutton', 'menuitem', 'tab'}


def unnamed_controls(page):
    """Interactive nodes with an empty accessible name, from Chrome's computed accessibility tree."""
    cdp = page.context.new_cdp_session(page)
    nodes = cdp.send('Accessibility.getFullAXTree')['nodes']
    cdp.detach()
    out = []
    for n in nodes:
        role = (n.get('role') or {}).get('value')
        if n.get('ignored') or role not in ROLES:
            continue
        if not str((n.get('name') or {}).get('value') or '').strip():
            out.append(role)
    return out


with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    ctx.route(re.compile(r'^https?://(?!localhost|127\.0\.0\.1)'), lambda r: (blocked.append(r.request.url), r.abort()))
    page = ctx.new_page()
    console = []
    page.on('console', lambda m: console.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: console.append(('pageerror', str(e))))
    shot = lambda name: page.screenshot(path=str(a.evidence / f'{name}.png'), full_page=True)

    def audit(where):
        bad = unnamed_controls(page)
        if bad:
            problems.append((where, bad[:5]))

    # 1. landing page: discover real sites
    page.goto(a.base + "#ui=full")
    expect(page.get_by_role('heading', name=re.compile('Launching to the Moon'))).to_be_visible(timeout=30000)
    audit('welcome'); shot('01-welcome')
    page.get_by_role('button', name=re.compile('^Explore landing sites')).click()
    page.get_by_label('Site A', exact=True).select_option('shackleton-rim-site04')
    page.get_by_label('Site B', exact=True).select_option('nobile-rim-1-site06')
    expect(page).to_have_url(re.compile(r'a=shackleton-rim-site04.*b=nobile-rim-1-site06'))
    # 4. mission period: terrain-aware sunlight and Earth visibility over time (2027-01-01, 14 days)
    page.goto(a.base + '#ui=full&ws=compare&a=shackleton-rim-site04&b=nobile-rim-1-site06&t=2027-01-01T00:00Z&d=14&at=2027-01-05T12:00Z')
    page.reload()
    expect(page.get_by_role('img', name=re.compile(r'^Sun elevation for both sites'))).to_be_visible(timeout=30000)
    expect(page.get_by_role('row', name=re.compile('Full Sun disc visible'))).to_be_visible()
    expect(page.get_by_text(re.compile('Terrain-aware visibility')).first).to_be_visible()
    audit('compare'); shot('04-compare-sun-earth')
    # 2-3. real 3D terrain for both sites, overlays, equal-footprint screening
    page.get_by_role('button', name='3D Terrain', exact=True).click()
    page.get_by_role('radio', name='Compare A and B').click()
    pa, pb = page.get_by_test_id('terrain-pane-A'), page.get_by_test_id('terrain-pane-B')
    expect(pa).to_have_attribute('data-site-id', 'site04', timeout=30000)
    expect(pb).to_have_attribute('data-site-id', 'site06')
    page.get_by_label('Shared maximum slope').fill('20')
    page.get_by_label('Shared maximum roughness').fill('1')
    page.get_by_label('Overlay layer').select_option('hazard')
    table = page.get_by_test_id('terrain-comparison')
    expect(table).not_to_contain_text('Loading', timeout=40000)
    expect(page.get_by_test_id('terrain-tradeoffs')).to_contain_text('not a landing-safety assessment')
    expect(table.locator('tr', has=page.locator('th', has_text='Screening result'))).to_contain_text('Meets configured criteria')
    audit('terrain-compare'); shot('02-terrain-compare')
    page.get_by_label('Lighting layer').select_option('sunlight')
    expect(page.get_by_test_id('lighting-stats-A')).to_be_visible(timeout=40000)
    shot('03-terrain-sunlight')
    # 5. explainable rankings with the same terrain limits
    page.goto(a.base + '#ui=full&ws=finder&a=shackleton-rim-site04&b=nobile-rim-1-site06&d=14&ss=2027-01-01T00:00Z&se=2027-01-31T00:00Z'
              '&rs=30&re=30&rd=200&rb=200&rj=&tr=20,1,100,90&w=0,0,1,0,0,1')
    page.reload()
    page.get_by_role('radio', name='Site A and B').click()
    page.get_by_role('button', name='Find mission windows').click()
    results = page.locator('table.results tbody tr')
    expect(results.first).to_be_visible(timeout=90000)
    top = results.first
    expect(top).to_contain_text('Nobile Rim 1')
    top.get_by_role('button', name='Why this window?').click()
    expect(page.get_by_test_id('score-breakdown')).to_be_visible()
    why = page.locator('.why').inner_text()
    audit('finder'); shot('05-finder-why')
    with page.expect_download() as dl:
        page.get_by_role('button', name='Download scenario and results (JSON)').click()
    scenario = json.loads(Path(dl.value.path()).read_text())
    assert scenario['provenance']['aiDisclosure'] and 'Not a NASA product' in scenario['provenance']['disclaimer']
    assert 'UTC' in scenario['provenance']['timeConvention']
    best = scenario['candidates'][0]
    # 6. immersive surface view from the recommendation, then move through time
    page.get_by_role('button', name='Open in Surface View').click()
    expect(page).to_have_url(re.compile(r'ws=surface.*a=nobile-rim-1-site06'))
    page.get_by_role('radio', name='3D first person (5 m terrain)').click()
    sky = page.get_by_test_id('fp-sky')
    expect(sky).to_have_attribute('data-sun-frac', re.compile(r'.'), timeout=60000)
    page.get_by_role('button', name='Look at the Sun').click()
    before = sky.get_attribute('data-sun-az')
    page.get_by_role('button', name='Next hour').click()
    expect(sky).not_to_have_attribute('data-sun-az', before)
    expect(page.get_by_test_id('xr-status')).to_have_attribute('data-xr', 'no')
    audit('surface-3d'); shot('06-surface-first-person')
    # 7. share link, mission summary export with sources/limitations, About page
    url = page.url
    page.get_by_role('button', name='Explore & Compare', exact=True).click()
    page.get_by_role('button', name=re.compile('mission summary', re.I)).first.click()
    with page.expect_download() as dl2:
        page.get_by_role('button', name='Download JSON').click()
    summary = json.loads(Path(dl2.value.path()).read_text())
    assert summary['provenance']['aiDisclosure'] and summary['dataSources'] and summary['limitations'], summary.keys()
    shot('07-mission-summary')
    page.get_by_role('button', name='Close summary').click()
    page.get_by_role('button', name='About & methodology', exact=True).click()
    expect(page.get_by_text('2031-12-31 18:00 UTC', exact=False).first).to_be_visible()
    expect(page.get_by_text('not a radio link budget', exact=False).first).to_be_visible()
    audit('about'); shot('08-about-sources')
    # shared link restores the immersive state in a fresh tab
    p2 = ctx.new_page()
    p2.goto(url)
    expect(p2.get_by_test_id('fp-sky')).to_be_visible(timeout=60000)
    p2.close()
    # mobile layout of every workspace
    page.set_viewport_size({'width': 390, 'height': 844})
    for ws in ('home', 'compare', 'finder', 'surface', 'terrain', 'about'):
        page.goto(a.base + f'#ui=full&ws={ws}&a=shackleton-rim-site04&b=nobile-rim-1-site06')
        page.reload()
        page.wait_for_timeout(2500)
        if not page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'):
            problems.append(('mobile overflow', ws))
    shot('09-mobile-terrain')
    bad = [m for m in console if not ('GPU stall due to ReadPixels' in m[1] or 'ERR_FAILED' in m[1] or 'net::' in m[1])]
    assert not bad, bad
    assert not problems, problems
    print(f'PASS full journey offline ({len(blocked)} external requests blocked, app unaffected): top window {best["site"]} '
          f'{best["startUtc"]} status {best["status"]} score {best["score"]:.3f}; evidence in {a.evidence}')
    print('WHY:', why[:400].replace('\n', ' | '))
    b.close()
