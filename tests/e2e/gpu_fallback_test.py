"""Milestone 9: behaviour without WebGL (GPU fallback). Chromium is started with --disable-3d-apis.

Usage: python tests/e2e/gpu_fallback_test.py [base_url]
Expect: 3D views report WebGL as unavailable with a usable alternative; 2D charts, finder, panorama keep working.
"""
import re, sys
from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:4173/'
with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--disable-3d-apis'])
    page = b.new_page(viewport={'width': 1280, 'height': 900})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    assert not page.evaluate("() => !!document.createElement('canvas').getContext('webgl2')"), 'WebGL unexpectedly available'
    page.goto(BASE + '#ui=full&ws=terrain&a=connecting-ridge&sv=A')
    expect(page.get_by_role('alert').filter(has_text='WebGL')).to_be_visible(timeout=30000)
    expect(page.get_by_text('The planner and Surface View remain available', exact=False)).to_be_visible()
    page.goto(BASE + '#ui=full&ws=surface&a=connecting-ridge&sv=A&fp=1')
    page.reload()
    expect(page.get_by_role('alert').filter(has_text='WebGL is unavailable')).to_be_visible(timeout=40000)
    page.get_by_role('radio', name='360° horizon panorama').click()
    expect(page.get_by_role('button', name='Look at the Sun')).to_be_visible()
    page.goto(BASE + '#ui=full&ws=compare&a=connecting-ridge&b=nobile-rim-1-site06')
    page.reload()
    expect(page.get_by_role('img', name=re.compile(r'^Sun elevation for both sites'))).to_be_visible(timeout=30000)
    page.goto(BASE + '#ui=full&ws=finder&a=connecting-ridge&b=nobile-rim-1-site06&ss=2027-01-01T00:00Z&se=2027-01-08T00:00Z')
    page.reload()
    page.get_by_role('radio', name='Site A and B').click()
    page.get_by_role('button', name='Find mission windows').click()
    expect(page.locator('table.results tbody tr').first).to_be_visible(timeout=60000)
    assert not errors, errors
    print('PASS no-WebGL fallback: 3D views explain the problem; panorama, charts and finder work')
    b.close()
