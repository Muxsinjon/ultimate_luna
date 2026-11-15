"""Playwright smoke tests for LunaWindow (webapp-testing skill pattern).

Usage:  python tests/e2e/smoke_test.py [base_url]     (default http://localhost:4173/)
Covers the prompt's end-to-end flow and asserts zero console errors/warnings. Exits non-zero on failure.
"""
import re
import sys

from playwright.sync_api import expect, sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/"
problems: list[str] = []
passed: list[str] = []


def check(name, fn):
    try:
        fn()
        passed.append(name)
        print("PASS", name)
    except Exception as e:  # noqa: BLE001 - report every failing check
        problems.append(f"{name}: {e}")
        print("FAIL", name, "-", (str(e).splitlines() or [repr(e)])[0])


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    console: list[str] = []
    # the headless software renderer reports 'GPU stall due to ReadPixels' for any WebGL page: a driver notice, not an app warning
    page.on("console", lambda m: console.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") and "GPU stall due to ReadPixels" not in m.text else None)
    page.on("pageerror", lambda e: console.append(f"pageerror: {e}"))

    def simple_view():
        """Simple view (default for new visitors) hides expert settings; the header switch reveals them."""
        page.goto(BASE + "#ui=simple&ws=finder")
        page.reload()
        expect(page.get_by_text("Minimum sunlight")).to_be_visible()
        expect(page.get_by_text("Maximum communication blackout")).to_be_hidden()
        expect(page.get_by_role("radiogroup", name="Visibility model")).to_be_hidden()
        page.get_by_role("button", name="Show all controls").click()
        expect(page.get_by_text("Maximum communication blackout")).to_be_visible()
        expect(page).to_have_url(re.compile(r"ui=full"))

    def welcome():
        page.goto(BASE + "#ui=full&ws=home")
        page.wait_for_load_state("networkidle")
        expect(page.get_by_role("heading", name=re.compile("Launching to the Moon"))).to_be_visible()
        page.get_by_role("button", name=re.compile("^Explore landing sites")).click()
        expect(page.get_by_role("heading", name="Explore and compare")).to_be_visible()
        expect(page).to_have_url(re.compile(r"ws=compare"))

    def pick_sites():
        page.get_by_label("Site A", exact=True).select_option("im-2")
        expect(page.get_by_label("Site A status")).to_contain_text("IM-2 Athena")
        expect(page).to_have_url(re.compile(r"a=im-2"))
        expect(page.get_by_role("img", name=re.compile(r"^Sun elevation for both sites"))).to_be_visible()
        expect(page.get_by_role("img", name=re.compile(r"^Earth elevation for both sites"))).to_be_visible()

    def scrub_time():
        slider = page.get_by_label("Selected time")
        before = slider.get_attribute("aria-valuetext")
        page.get_by_role("button", name="Next hour").click()
        expect(slider).not_to_have_attribute("aria-valuetext", before)
        page.locator("body").click(position={"x": 5, "y": 5})
        after = slider.get_attribute("aria-valuetext")
        page.keyboard.press("Shift+ArrowRight")
        expect(slider).not_to_have_attribute("aria-valuetext", after)

    def compare_and_models():
        expect(page.get_by_role("heading", name="Site comparison over the mission")).to_be_visible()
        # terrain-aware: 11 rows + full disc / partial disc / disc-weighted sunlight (Milestone 5)
        expect(page.locator(".cmp-table tbody tr")).to_have_count(14)
        page.get_by_label("Highlight differences").check()
        expect(page.get_by_role("img", name=re.compile("Sun: A only"))).to_be_visible()
        page.get_by_role("radio", name="Geometric 0°").click()
        expect(page.get_by_text("Geometric visibility: local terrain obstruction not included").first).to_be_visible()
        expect(page.locator(".cmp-table tbody tr")).to_have_count(11)  # partial discs are not resolved geometrically
        page.get_by_role("radio", name="Terrain-aware").click()

    def finder_and_why():
        page.get_by_role("button", name="Open in Mission Window Finder").click()
        expect(page.get_by_role("heading", name=re.compile("^Mission Window Finder"))).to_be_visible()
        page.get_by_role("button", name="Find mission windows").click()
        expect(page.locator(".finder-summary")).to_contain_text("Meets requirements", timeout=20000)
        page.get_by_role("button", name="Why this window?").first.click()
        why = page.locator(".why")
        expect(why).to_contain_text("Requirements")
        expect(why).to_contain_text("Compared with alternatives")
        why.get_by_role("button", name="Open in Surface View").click()
        expect(page.get_by_role("heading", name="Surface view")).to_be_visible()
        page.get_by_role("button", name="Look at the Sun").click()
        expect(page.locator(".sv-readout")).to_contain_text("Azimuth")

    def summary():
        page.get_by_role("button", name="Back to Explore and Compare").click()
        page.get_by_role("button", name="Generate mission summary").click()
        dlg = page.get_by_role("dialog")
        expect(dlg).to_contain_text("Limitations")
        expect(dlg.get_by_role("button", name="Download JSON")).to_be_visible()
        dlg.get_by_role("button", name="Close summary").click()

    def share_link():
        url = BASE + "#ui=full&ws=surface&a=im-1&b=im-2&sv=A&t=2026-12-01T00%3A00Z&d=3&at=2026-12-01T06%3A00Z&vis=geometric&mode=explore&tz=utc"
        p2 = ctx.new_page()
        p2.goto(url)
        p2.wait_for_load_state("networkidle")
        expect(p2.get_by_role("heading", name="Surface view")).to_be_visible()
        expect(p2.locator(".site-facts-mini").first).to_contain_text("IM-1 Odysseus")
        expect(p2.get_by_label("Selected time")).to_have_attribute("aria-valuetext", "2026-12-01 06:00 UTC")
        expect(p2.get_by_role("radio", name="Geometric 0°")).to_have_attribute("aria-checked", "true")
        p2.close()

    def unsupported_date():
        p3 = ctx.new_page()
        p3.goto(BASE + "#ui=full&ws=compare&t=2040-01-01T00%3A00Z&d=14")
        p3.wait_for_load_state("networkidle")
        expect(p3.get_by_text(re.compile("past the supported data"))).to_be_visible()
        p3.close()

    def demo():
        page.get_by_role("button", name="LunaWindow home").click()
        page.get_by_role("button", name="Try the guided demo").click()
        expect(page.locator(".demo")).to_contain_text("step 1 of")
        for _ in range(4):
            page.locator(".demo").get_by_role("button", name="Next").click()
        expect(page.locator(".demo")).to_contain_text("An unfavourable moment")
        page.locator(".demo").get_by_role("button", name="Exit demo").click()

    def about():
        page.get_by_role("button", name="About & methodology").click()
        expect(page.get_by_role("heading", name=re.compile("About LunaWindow"))).to_be_visible()
        expect(page.get_by_role("heading", name="Supported sites and dates")).to_be_visible()

    for name, fn in [
        ("simple view hides expert settings", simple_view),
        ("welcome screen and entry", welcome),
        ("pick two sites, elevation charts", pick_sites),
        ("scrub time (buttons and keyboard)", scrub_time),
        ("comparison, differences, model toggle", compare_and_models),
        ("finder, why-this-window, surface view", finder_and_why),
        ("mission summary", summary),
        ("share link restores state", share_link),
        ("unsupported date explained", unsupported_date),
        ("guided demo", demo),
        ("about page", about),
    ]:
        check(name, fn)

    if console:
        problems.append("console: " + " | ".join(console))
        print("FAIL console errors/warnings:", console)
    else:
        print("PASS no console errors or warnings")
    browser.close()

print(f"\n{len(passed)} passed, {len(problems)} failed")
sys.exit(1 if problems else 0)
