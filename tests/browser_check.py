"""Browser check for the Renew playground, by John Khan.

Usage: python3 tests/browser_check.py http://127.0.0.1:8932/playground/ [path/to/axe.min.js]
Runs every bundled example, an error case, the compiled tab and keyboard tab switching,
at desktop and phone width, and runs axe-core (WCAG 2.2 AA plus best practice) when a path is given.
"""
import sys, asyncio
from playwright.async_api import async_playwright

URL = sys.argv[1]
AXE = sys.argv[2] if len(sys.argv) > 2 else None
fails = []

async def axe(pg, label):
    if not AXE:
        return
    await pg.add_script_tag(path=AXE)
    v = await pg.evaluate("async()=>(await axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice']})).violations.map(x=>x.id+':'+x.nodes.map(n=>n.target.join(' ')).slice(0,3).join(','))")
    if v:
        fails.append(f"{label}: axe {v}")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w, h in [(1440, 1000), (390, 844)]:
            pg = await b.new_page(viewport={"width": w, "height": h})
            errors = []
            pg.on("pageerror", lambda e: errors.append(str(e)))
            await pg.goto(URL)
            await pg.wait_for_timeout(700)
            n = await pg.locator("#example option").count()
            for k in range(n):
                await pg.select_option("#example", str(k))
                await pg.wait_for_timeout(250)
                status = await pg.locator("#status").inner_text()
                if not status.startswith("Ran"):
                    fails.append(f"{w} example {k}: {status}")
                await axe(pg, f"{w} example {k}")
            if "$581.60" not in await pg.locator("#view-report").inner_text():
                fails.append(f"{w} hello example did not show $581.60")
            # Round 2: the 2026 example shows an equal horizon, its notes, a sweep, and the offered rate.
            await pg.select_option("#example", "0")
            await pg.wait_for_timeout(300)
            rep = await pg.locator("#view-report").inner_text()
            for needle in ["Compare over 5 years", "Offered 5 year", "renews at 3.99%, its current rate", "Sweep renews for", "Time to pay off assumes",
                           "Payment after term", "$2,775.40 monthly", "Offered 5 year (for comparison)", "1.5 percentage points", "compare posted with posted"]:
                if needle not in rep:
                    fails.append(f"{w} 2026 example missing {needle!r}")
            await axe(pg, f"{w} 2026 example with notes")
            # Round 3: the forward table leaves out the 2021 plan, and every column of it is visible beside the editor.
            rows = await pg.locator(".tbl-wrap").nth(0).locator("tbody th").all_inner_texts()
            if "Signed in 2021" in rows:
                fails.append(f"{w} 2021 plan is still in the forward table")
            if w >= 1000:
                over = await pg.evaluate("(() => { const t = document.querySelector('.tbl-wrap'); return t.scrollWidth - t.clientWidth; })()")
                if over > 2:
                    fails.append(f"{w} comparison table is cut off by {over}px")
            # A plan marked variable gets a warning box under its table and its single values.
            await pg.locator("#editor").fill('mortgage "A"\n  balance $100,000\n  rate 5% variable\n  amortization 25 years\n  term 5 years\ncompare all by payment\nshow payment of "A"\n')
            await pg.wait_for_timeout(600)
            if await pg.locator(".note.warn").count() != 2:
                fails.append(f"{w} variable rate warnings not shown under the table and the value")
            await axe(pg, f"{w} variable warning")
            await pg.select_option("#example", "0")
            await pg.wait_for_timeout(300)
            # Compiled output, run in the page, must print the same report as the interpreter.
            same = await pg.evaluate("""() => { const src = document.getElementById('editor').value; const m = { exports: {} };
                new Function('module', 'require', Renew.compile(src))(m, undefined); return m.exports.report === Renew.run(src).text; }""")
            if not same:
                fails.append(f"{w} compiled report differs from the interpreter in the browser")
            # A sweep with the wrong unit is a type error with a hint.
            await pg.locator("#editor").fill('mortgage "A"\n  balance $100,000\n  rate 5%\n  amortization 25 years\n  term 5 years\nsweep "A" rate from 4 to 7% step 1%\n')
            await pg.wait_for_timeout(600)
            if "needs a percentage after from" not in await pg.locator("#view-report").inner_text():
                fails.append(f"{w} sweep type error not shown")
            await pg.locator("#editor").fill('mortgage "A"\n  balance 5\n')
            await pg.wait_for_timeout(600)
            if "Line 2" not in await pg.locator("#status").inner_text():
                fails.append(f"{w} error not reported")
            await axe(pg, f"{w} error state")
            await pg.click("#goto-err")
            if await pg.evaluate("document.activeElement.id") != "editor":
                fails.append(f"{w} go to line did not focus the editor")
            await pg.select_option("#example", "0")
            await pg.wait_for_timeout(300)
            await pg.focus("#tab-report")
            await pg.keyboard.press("ArrowRight")
            if await pg.locator("#view-js").is_hidden():
                fails.append(f"{w} arrow key did not open the compiled tab")
            if "renewKernel" not in await pg.locator("#js-out").inner_text():
                fails.append(f"{w} compiled output missing the kernel")
            await axe(pg, f"{w} compiled tab")
            await pg.goto(URL)
            await pg.keyboard.press("Tab")
            if await pg.evaluate("document.activeElement.className") != "skip":
                fails.append(f"{w} first tab stop is not the skip link")
            sw = await pg.evaluate("document.documentElement.scrollWidth")
            if sw > w + 1:
                fails.append(f"{w} page is {sw}px wide")
            if errors:
                fails.append(f"{w} page errors {errors}")
            await pg.close()
        await b.close()

asyncio.run(main())
if fails:
    print("FAIL")
    for f in fails:
        print(" ", f)
    sys.exit(1)
print("playground check passed: every example x 2 widths, horizon notes and sweep against a plan, payment after term, table fits, variable warnings, compiled equals interpreted, sweep type error, error state, go to line, keyboard tabs, layout" + (", axe 0 violations" if AXE else ""))
