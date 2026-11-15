"""Milestone 6 end-to-end: two-site Mission Window Finder workflow on real NASA/JPL data.

Usage: python tests/e2e/finder_test.py [base_url]
Shackleton Rim (PGDA Site04 DEM centre) vs Nobile Rim 1 (Site06 DEM centre), 14-day missions in January 2027, with an
illustrative terrain requirement (not a NASA standard). Checks: terrain screen equals an independent numpy count on the
shipped 5 m layers; terrain decides pass/fail; unknown terrain is insufficient data; the score breakdown sums to the
score; the downloaded scenario's ranking is re-derived independently from its own reported components; choosing a
window updates the shared site/date state in other workspaces.
"""
import json, math, re, sys
from pathlib import Path
import numpy as np
from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / 'web/public/data/terrain'
R = 1737400.0
SLOPE, ROUGH, RADIUS, MINPCT = 20, 1, 100, 90


def independent_meets_pct(site_id, lat, lon):
    m = json.loads((WEB / site_id / 'hazards/hazards.json').read_text())
    t = json.loads((WEB / site_id / 'terrain.json').read_text())
    s = np.frombuffer((WEB / site_id / 'hazards/slope.u16').read_bytes(), '<u2').reshape(m['height'], m['width'])
    g = np.frombuffer((WEB / site_id / 'hazards/roughness.u16').read_bytes(), '<u2').reshape(m['height'], m['width'])
    la, lo = math.radians(lat), math.radians(lon)
    k = 2 * R * math.tan(math.pi / 4 + la / 2)
    x, y = k * math.sin(lo), k * math.cos(lo)
    z = np.frombuffer((WEB / site_id / t['assets']['surf']['file']).read_bytes(), '<f4').reshape(t['height'], t['width'])
    c, r = (x - t['x0']) / t['dx'], (y - t['y0']) / t['dy']
    c0, r0 = int(c), int(r)
    fc, fr = c - c0, r - r0
    h = (z[r0, c0] * (1 - fc) + z[r0, c0 + 1] * fc) * (1 - fr) + (z[r0 + 1, c0] * (1 - fc) + z[r0 + 1, c0 + 1] * fc) * fr
    rr = RADIUS * (1 + (x * x + y * y) / (4 * R * R)) / (1 + h / R)
    cols = m['x0'] + np.arange(m['width']) * m['dx']
    rows = m['y0'] + np.arange(m['height']) * m['dy']
    inside = (cols[None, :] - x) ** 2 + (rows[:, None] - y) ** 2 <= rr ** 2
    sv, gv = s[inside], g[inside]
    assert (sv != m['noData']).all() and (gv != m['noData']).all()
    return 100 * float(np.mean((sv * m['quantum'] <= SLOPE) & (gv * m['quantum'] <= ROUGH)))


sites = {s['id']: s for s in json.loads((ROOT / 'web/public/data/sites.json').read_text())['sites']}
expected = {sid: independent_meets_pct(t, sites[sid]['lat'], sites[sid]['lon']) for sid, t in (('shackleton-rim-site04', 'site04'), ('nobile-rim-1-site06', 'site06'))}
print('independent terrain share', expected)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--enable-unsafe-swiftshader'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    page = ctx.new_page()
    console = []
    page.on('console', lambda m: console.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: console.append(('pageerror', str(e))))
    page.goto(BASE + '#ui=full&ws=finder&a=shackleton-rim-site04&b=nobile-rim-1-site06&d=14&ss=2027-01-01T00:00Z&se=2027-01-15T00:00Z'
              f'&rs=0&re=0&rd=2000&rb=2000&rj=&tr={SLOPE},{ROUGH},{RADIUS},{MINPCT}&w=0,0,1,0,0,1')
    expect(page.get_by_label('Require a suitable terrain footprint')).to_be_checked()
    page.get_by_role('radio', name='Site A and B').click()
    page.get_by_role('button', name='Find mission windows').click()
    table = page.locator('table.results')
    expect(table.locator('tbody tr').first).to_be_visible(timeout=60000)

    def rows_for(name):
        page.locator('.list-tools select').nth(1).select_option(label=next(o for o in page.locator('.list-tools select').nth(1).locator('option').all_inner_texts() if o.startswith(name)))
        return table.locator('tbody tr').all()

    for name, sid in (('Shackleton Rim', 'shackleton-rim-site04'), ('Nobile Rim 1', 'nobile-rim-1-site06')):
        rs = rows_for(name)
        assert rs, name
        terr = rs[0].locator('td').nth(8).inner_text()
        got = float(re.match(r'([\d.]+)', terr).group(1))
        assert abs(got - expected[sid]) <= 0.6, (name, got, expected[sid])  # display rounds to whole %
        statuses = {r.locator('td').nth(10).inner_text().strip() for r in rs}
        if expected[sid] >= MINPCT:
            assert any('Meets requirements' in s for s in statuses), statuses
        else:
            assert not any('Meets requirements' in s for s in statuses), statuses
    page.locator('.list-tools select').nth(1).select_option('all')
    # top-ranked row explains its score; contributions sum to the score
    table.locator('tbody tr').first.get_by_role('button', name='Why this window?').click()
    br = page.get_by_test_id('score-breakdown')
    expect(br).to_be_visible()
    contrib = [float(r.locator('td').nth(2).inner_text()) for r in br.locator('tbody tr').all()]
    score = float(re.search(r'Preference score ([\d.]+)', page.locator('.why').inner_text()).group(1))
    assert abs(sum(contrib) - score) < 0.002, (contrib, score)
    # downloaded scenario: independent re-derivation of the ranking from its own components
    with page.expect_download() as dl:
        page.get_by_role('button', name='Download scenario and results (JSON)').click()
    data = json.loads(Path(dl.value.path()).read_text())
    assert data['inputs']['hardRequirements']['terrain'] == {'maxSlopeDeg': SLOPE, 'maxRoughM': ROUGH, 'radiusM': RADIUS, 'minMeetsPct': MINPCT}
    order = {'meets': 0, 'partial': 1, 'fails': 2, 'insufficient': 3}
    w = data['inputs']['softPreferenceWeights']
    for c in data['candidates']:
        m = c['metrics']
        parts = [(w['joint'], m['jointPct'] / 100)] + ([(w['terrain'], c['terrainMeetsPct'] / 100)] if c['terrainMeetsPct'] is not None else [])
        s = sum(a * v for a, v in parts) / sum(a for a, _ in parts)
        assert abs(s - c['score']) < 1e-9, c
        assert (c['status'] == 'meets') == all(k['pass'] for k in c['checks'])  # pass/fail independent of sort order
    resorted = sorted(data['candidates'], key=lambda c: (order[c['status']], c['failedRequirements'], -(c['score'] if c['score'] is not None else -1),
                                                        c['metrics']['longestDarkH'], c['startUtc'], c['site']))
    assert [c['rank'] for c in resorted] == list(range(1, len(resorted) + 1))
    # choosing a recommendation updates shared state in the other workspaces
    nobile = [r for r in rows_for('Nobile Rim 1')][0]
    start = nobile.locator('td').nth(1).inner_text()
    nobile.get_by_role('button', name='Why this window?').click()
    page.get_by_role('button', name='Open in 3D terrain').click()
    expect(page).to_have_url(re.compile(r'ws=terrain.*a=nobile-rim-1-site06'))
    expect(page.get_by_test_id('sky-readout')).to_contain_text(start[:10], timeout=30000)
    # all listed sites: sites without processed 5 m terrain are insufficient data with the reason
    page.get_by_role('button', name='Mission Window Finder', exact=True).click()
    page.get_by_role('radio', name=re.compile('^All .* listed sites')).click()
    page.get_by_role('button', name=re.compile('Recalculate|Find mission windows')).click()
    expect(table.locator('tbody tr').first).to_be_visible(timeout=90000)
    page.locator('.list-tools select').nth(1).select_option(label='Apollo 11, Tranquility Base')
    first = table.locator('tbody tr').first
    expect(first.locator('td').nth(10)).to_contain_text('Insufficient data')
    expect(first.locator('td').nth(8)).to_have_text('Unknown')
    first.get_by_role('button', name='Why this window?').click()
    expect(page.get_by_test_id('why-insufficient')).to_contain_text('No processed 5 m terrain covers')
    bad = [m for m in console if not (m[0] == 'warning' and 'GPU stall due to ReadPixels' in m[1])]
    assert not bad, bad
    print(f"PASS two-site finder workflow on real data: terrain {expected}, {len(data['candidates'])} candidates re-ranked independently, "
          'score breakdown, shared-state hand-off, insufficient terrain elsewhere')
    b.close()
