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
states = []

async def axe(pg, label):
    if not AXE:
        return
    states.append(label)
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
            lim = await pg.locator("#limits").inner_text()
            if "Scenarios, not contract terms" not in lim or "mathematical scenarios" not in lim:
                fails.append(f"{w}: the limits box is missing")
            n = await pg.locator("#example option").count()
            if n != 7:
                fails.append(f"{w}: {n} examples, expected 7")
            for k in range(n):
                await pg.select_option("#example", str(k))
                await pg.wait_for_timeout(250)
                status = await pg.locator("#status").inner_text()
                if not status.startswith("Ran"):
                    fails.append(f"{w} example {k}: {status}")
                await axe(pg, f"{w} example {k}")
            await pg.select_option("#example", "3")
            await pg.wait_for_timeout(250)
            if "$581.60" not in await pg.locator("#view-report").inner_text():
                fails.append(f"{w} hello example did not show $581.60")
            # Equal horizons: the 2026 example shows an equal horizon, its notes, a sweep, and the offered rate.
            await pg.select_option("#example", "0")
            await pg.wait_for_timeout(300)
            rep = await pg.locator("#view-report").inner_text()
            for needle in ["Compare over 5 years", "Offered 5 year", "renews at 3.99%, its current rate", "Sweep renews for", "Time to pay off assumes",
                           "Payment after term", "$2,775.40 monthly", "Offered 5 year (for comparison)", "1.5 percentage points", "compare posted with posted"]:
                if needle not in rep:
                    fails.append(f"{w} 2026 example missing {needle!r}")
            await axe(pg, f"{w} 2026 example with notes")
            # Fair comparisons: the forward table leaves out the 2021 plan, and every column of it is visible beside the editor.
            rows = await pg.locator(".tbl-wrap").nth(0).locator("tbody th").all_inner_texts()
            if "Signed in 2021" in rows:
                fails.append(f"{w} 2021 plan is still in the forward table")
            if w >= 1000:
                over = await pg.evaluate("(() => { const t = document.querySelector('.tbl-wrap'); return t.scrollWidth - t.clientWidth; })()")
                if over > 2:
                    fails.append(f"{w} comparison table is cut off by {over}px")
            # Paths, break even and inputs: break even, the inputs box, and stacked cards with no sideways scroll on a phone.
            if "= 4.889%" not in rep or "With renews at 4.888%" not in rep:
                fails.append(f"{w} break even line missing")
            if await pg.locator("#inputs").is_hidden() or await pg.locator("#in-discount").input_value() != "1.5%":
                fails.append(f"{w} input box for discount missing")
            await pg.locator("#in-discount").fill("1%")
            await pg.wait_for_timeout(700)
            rep1 = await pg.locator("#view-report").inner_text()
            if "= 5.388%" not in rep1:
                fails.append(f"{w} changing the discount input did not rerun with 1%")
            if "input discount = 1.5%" not in await pg.locator("#editor").input_value():
                fails.append(f"{w} the input box changed the program text")
            await pg.locator("#in-discount").fill("1")
            await pg.wait_for_timeout(700)
            if "must be a percentage" not in await pg.locator("#view-report").inner_text():
                fails.append(f"{w} a bad input value was not reported")
            await pg.locator("#in-discount").fill("1.5%")
            await pg.wait_for_timeout(700)
            await axe(pg, f"{w} inputs")
            if w < 700:
                wide = await pg.evaluate("(() => [...document.querySelectorAll('.tbl-wrap')].map(t => t.scrollWidth - t.clientWidth).filter(x => x > 2).length)()")
                if wide:
                    fails.append(f"{w} {wide} tables still scroll sideways")
                disp = await pg.evaluate("getComputedStyle(document.querySelector('.tbl-wrap tbody tr')).display")
                lab = await pg.evaluate("getComputedStyle(document.querySelector('.tbl-wrap td'), '::before').content")
                if disp != "block" or "Payment" not in lab:
                    fails.append(f"{w} tables are not stacked cards ({disp}, {lab})")
            # Payment held: example 5 shows the trigger rate and the longer time to pay off.
            labels = await pg.locator("#example option").all_inner_texts()
            k5 = next((k for k, t in enumerate(labels) if "payment held" in t.lower()), None)
            if k5 is None:
                fails.append(f"{w} payment held example missing from the list")
            else:
                await pg.select_option("#example", str(k5))
                await pg.wait_for_timeout(400)
                rep5 = await pg.locator("#view-report").inner_text()
                for needle in ["Trigger rate", "6.53%", "33 years 8 months", "$2,389.93", "Variable rate, payment held"]:
                    if needle not in rep5:
                        fails.append(f"{w} payment held example missing {needle!r}")
                await axe(pg, f"{w} payment held")
            k6 = next((k for k, t in enumerate(labels) if "trigger boundary" in t.lower()), None)
            if k6 is None:
                fails.append(f"{w} trigger-rate boundary example missing from the list")
            else:
                await pg.select_option("#example", str(k6))
                await pg.wait_for_timeout(400)
                rep6 = await pg.locator("#view-report").inner_text()
                for needle in ["6.53%", "6.6%", "106 years 1 month", "6.607%", "a mathematical projection, not a contract term"]:
                    if needle not in rep6:
                        fails.append(f"{w} trigger-rate boundary example missing {needle!r}")
                if any("trigger crossed" in t.lower() or "refused" in t.lower() for t in labels):
                    fails.append(f"{w} refused trigger example should not be in the playground")
                await axe(pg, f"{w} trigger boundary")
            # A plan marked variable gets a warning box under its table and its single values.
            await pg.locator("#editor").fill('mortgage "A"\n  balance $100,000\n  rate 5% variable\n  amortization 25 years\n  term 5 years\n  renews at 5.5%\ncompare all by payment\nshow payment of "A"\n')
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
        # The embed page imports the compiled ES module and draws from its raw numbers.
        EMBED = URL.split("/playground")[0] + "/examples/embed.html"
        for w, h in [(1100, 900), (390, 844)]:
            pg = await b.new_page(viewport={"width": w, "height": h})
            errors = []
            pg.on("pageerror", lambda e: errors.append(str(e)))
            await pg.goto(EMBED)
            await pg.wait_for_timeout(700)
            if "4.889%" not in await pg.locator("#answer").inner_text():
                fails.append(f"embed {w}: break even 4.889% not shown")
            if await pg.locator("#chart svg rect").count() < 4 or await pg.locator("#table tbody tr").count() != 2:
                fails.append(f"embed {w}: chart or table missing")
            await axe(pg, f"embed {w}")
            await pg.locator("#discount").fill("1%")
            await pg.wait_for_timeout(500)
            if "5.388%" not in await pg.locator("#answer").inner_text():
                fails.append(f"embed {w}: input 1% did not give 5.388%")
            await pg.locator("#discount").fill("1")
            await pg.wait_for_timeout(500)
            if "written with its unit" not in await pg.locator("#discount-error").inner_text() or await pg.get_attribute("#discount", "aria-invalid") != "true":
                fails.append(f"embed {w}: a bare number was not refused")
            await axe(pg, f"embed {w} error")
            sw = await pg.evaluate("document.documentElement.scrollWidth")
            if sw > w + 1:
                fails.append(f"embed {w}: page is {sw}px wide")
            if errors:
                fails.append(f"embed {w}: page errors {errors}")
            await pg.close()
        # The smallest integration page: one input, one answer, the error shown as it is.
        MINIMAL = URL.split("/playground")[0] + "/examples/minimal.html"
        for w, h in [(1100, 900), (390, 844)]:
            pg = await b.new_page(viewport={"width": w, "height": h})
            errors = []
            pg.on("pageerror", lambda e: errors.append(str(e)))
            await pg.goto(MINIMAL)
            await pg.wait_for_timeout(500)
            if "4.889%" not in await pg.locator("#out").inner_text():
                fails.append(f"minimal {w}: 4.889% not shown")
            await axe(pg, f"minimal {w}")
            await pg.locator("#discount").fill("1%")
            await pg.wait_for_timeout(300)
            if "5.388%" not in await pg.locator("#out").inner_text():
                fails.append(f"minimal {w}: input 1% did not give 5.388%")
            await pg.locator("#discount").fill("abc")
            await pg.wait_for_timeout(300)
            if "must be a percentage" not in await pg.locator("#out").inner_text():
                fails.append(f"minimal {w}: a bad input was not shown as an error")
            await axe(pg, f"minimal {w} error")
            sw = await pg.evaluate("document.documentElement.scrollWidth")
            if sw > w + 1:
                fails.append(f"minimal {w}: page is {sw}px wide")
            if errors:
                fails.append(f"minimal {w}: page errors {errors}")
            await pg.close()
        await b.close()

asyncio.run(main())
if fails:
    print("FAIL")
    for f in fails:
        print(" ", f)
    sys.exit(1)
print("playground check passed: limits box, every example (7) at 1440 and 390, minimal page with its input and error at 1100 and 390, payment held example, embed page with its input and error at 1100 and 390, break even, inputs box reruns without editing the program, stacked cards with no sideways scroll at 390, horizon notes and sweep against a plan, payment after term, table fits, variable warnings, compiled equals interpreted, sweep type error, error state, go to line, keyboard tabs, layout" + (f", axe 0 violations in {len(states)} states" if AXE else ""))
