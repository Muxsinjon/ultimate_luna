"""Capture every LunaWindow workspace at desktop (1440x900) and phone (390x844) sizes.

Usage: python tests/e2e/screenshots.py <base_url> <out_dir>
Also prints any console errors/warnings seen on each screen.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173/"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "docs/screenshots/after")
OUT.mkdir(parents=True, exist_ok=True)


def finder(page):
    page.get_by_role("button", name="Find mission windows").click()
    page.locator(".finder-summary").wait_for(timeout=20000)
    page.get_by_role("button", name="Why this window?").nth(3).click()
    page.wait_for_timeout(300)


def surface(page):
    page.get_by_role("button", name="Look at the Sun").click()
    page.wait_for_timeout(300)


SCREENS = {
    "welcome": ("", None),
    "compare": ("#ui=full&ws=compare", None),
    "finder": ("#ui=full&ws=finder", finder),
    "surface": ("#ui=full&ws=surface", surface),
    "about": ("#ui=full&ws=about", None),
}
SIZES = {"1440": (1440, 900), "390": (390, 844)}

problems = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for size_name, (w, h) in SIZES.items():
        for name, (frag, action) in SCREENS.items():
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
            page = ctx.new_page()
            msgs = []
            page.on("console", lambda m, msgs=msgs: msgs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e, msgs=msgs: msgs.append(f"pageerror: {e}"))
            page.goto(BASE + frag)
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(600)
            if action:
                action(page)
            path = OUT / f"{name}-{size_name}.png"
            page.screenshot(path=str(path), full_page=True)
            print("saved", path)
            for m in msgs:
                problems.append(f"[{name} {size_name}] {m}")
            ctx.close()
    browser.close()

print("\nconsole problems:" if problems else "\nno console errors or warnings")
for m in problems:
    print(" ", m)
