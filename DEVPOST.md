# Devpost submission draft: Renew, Syntax Summit

Draft only. Not submitted and no Devpost project page has been created.

## Project name

Renew

## Elevator pitch (200 characters max)

Renew is a small typed language for Canadian mortgage renewals. Write the choices as a program, see every formula, compile it to JavaScript. Real Bank of Canada posted rates built in.

## Thumbnail (3:2)

`docs/screenshots/thumbnail-3x2.png`

## About the project

**Look at these in 3 minutes:**

1. [Playground](https://alenzacodes.github.io/renew-lang/playground/), 2026 example: break even 4.889%; type 1% in the discount box and it moves to 5.388% with no change to the program.
2. Pick example 04 and change `rate 5%` to `rate 5`: the error has a line, a column, a caret and "Add a percent sign, like 5%."
3. Pick example 07: two break even changes 29 cents apart, both found, because the money search covers every cent.
4. Pick example 06: just under the trigger rate, 106 years 1 month to pay off, labelled as a mathematical projection, not a contract term.
5. [examples/minimal.html](https://alenzacodes.github.io/renew-lang/examples/minimal.html): a compiled program in a page in about 20 lines of script; [docs/INTEGRATION.md](https://github.com/ALENZACODES/renew-lang/blob/main/docs/INTEGRATION.md) gives the contract.

**Try it:** [playground](https://alenzacodes.github.io/renew-lang/playground/) · [embed example](https://alenzacodes.github.io/renew-lang/examples/embed.html), a page built on a compiled Renew program · `node bin/renew.js run examples/01-renewal-2026.renew --json` for results as data · [language reference](https://github.com/ALENZACODES/renew-lang/blob/main/docs/LANGUAGE.md)

### Inspiration

When a mortgage term ends in Canada, the borrower gets a few weeks to choose. Renew for five years at today's rate? Take a shorter term and decide again later? Change the amortization to keep the old payment? Each choice is a small calculation, usually done in a spreadsheet or in an online calculator that answers one case at a time. A renewal decision already has the shape of a program: some facts, a few alternatives, and checks like "the payment must stay under my budget". So I wrote the language for it.

Renew is for a borrower coming up to renewal who is comfortable editing a short text file, and for developers who want renewal maths they can read, test and build into their own page.

### What it does

Renew programs read like the conversation at renewal time:

```
input discount = 1.5%

mortgage "Renewal"
  balance $441,063.33
  rate posted 5 year on 2026-11-18 fixed
  amortization 20 years
  term 5 years

scenario "Offered 5 year" from "Renewal"
  rate posted 5 year on 2026-11-18 - discount fixed

scenario "Offered 1 year, then decide" from "Renewal"
  rate posted 1 year on 2026-11-18 - discount fixed
  term 1 year

scenario "Variable, payment held" from "Renewal"
  rate 4.2% then 5.5% after 6 months payment held

compare all by payment, interest, paid, balance, payoff
    over 5 years
sweep "Offered 1 year, then decide" renews from 3.5% to 6% step 0.5%
    by payment, interest over 5 years
    against "Offered 5 year"
show break even renews for "Offered 1 year, then decide" against "Offered 5 year"
    by interest over 5 years
show trigger rate of "Variable, payment held"
explain "Offered 5 year"
check payment of "Offered 1 year, then decide" <= $3,100
```

The posted rate is the Bank of Canada benchmark. The offers apply the same discount to the 1 and 5 year posted rates, so offers are compared with offers; 1.5 points is an example input. In the bundled 2026 example the sweep shows the 1 year offer costing less interest over 5 years than the 5 year offer if it renews at 4.5% next year ($87,921.40 against $94,169.01) and more if it renews at 5% ($95,967.52). The `break even` line gives 4.889%: the first renewal rate, on a grid of a thousandth of a point, at which the 1 year offer's interest is no longer less. The note under it gives the interest at 4.888% ($94,162.75, less than $94,169.01) and at 4.889% ($94,178.85, not less), so anyone can check it with two `compare` lines. The discount is an `input`, so it has a box in the playground: at 1 point the break even moves to 5.388%, with no change to the program.

- **Typed units.** Money, percentages, lengths of time, numbers and dates are types. `rate 5` is refused with "Add a percent sign, like 5%." and `$5 * $5` is refused before anything runs.
- **Scenarios as differences.** A scenario copies a mortgage and changes only what it states.
- **Fair comparisons.** `compare ... over 5 years` follows every plan for the same months. Without `over`, plans with different terms carry a warning, and posted rates next to typed ones get a note.
- **Rate paths.** `rate 5.2% then 4.7% after 12 months` changes the rate inside the term, and `renews at 4.5% then 5% after 1 year` renews in steps. `explain` lists every change. A plan marked `variable` must have something that changes its rate, or the label is refused as one that would change nothing.
- **Payment held.** `payment held` keeps the payment and lets the time to pay off move, as many variable mortgages do, and `trigger rate of "Plan"` is where the payment only covers the interest. In `examples/05-payment-held.renew` the same $2,147.67 payment leaves $383,994.55 owed after 3 years instead of $374,727.46, with a trigger rate of 6.53% (6.5301% before rounding down for display). A path that reaches the trigger is an error. Just under it, `examples/06-trigger-boundary.renew` gives 106 years 1 month to pay off, labelled as a mathematical projection, not a contract term.
- **Break even on any setting.** `break even renews "1 year" vs "5 year" by interest over 5 years` finds where the answer changes, on a grid of 0.001%, a cent or a month. Every rate and month is worked out. For money, a certified search covers every cent: it skips a stretch only where a proven bound shows the answer cannot change there. `examples/07-two-crossings.renew` has two changes 29 cents apart, and both are found.
- **One rule for inputs.** `input discount = 1.5%` gets a box in the playground, `--input discount=1%` on the command line, and `run({ discount: "1%" })` from code. A bare `1` is refused, because it does not say its unit.
- **Results as data.** `--json` and `compile --module` give typed values and raw table numbers. `examples/minimal.html` is the smallest page built on a compiled program, and docs/INTEGRATION.md documents the `run(inputs)` contract, its errors, its data sources and its limits.
- **Posted rates.** `posted 5 year on DATE` reads a bundled, cited copy of the Bank of Canada weekly series V80691333, V80691334 and V80691335 (1, 3 and 5 year conventional mortgage, chartered banks), January 2016 to November 18, 2026. These are posted benchmarks, not quotes. A date outside the copy is an error that says to type the rate or run `npm run rates`. Renew never guesses a rate.
- **Sweeps and amortization helpers.** `sweep "Renewal" rate from 4% to 7% step 0.5%` gives one row per value, type checked against the setting, and `against "Plan"` adds a fixed plan as the last row. `amortization to fit payment of "Signed in 2021"` and `amortization remaining from "Signed in 2021"` work the amortization out for you.
- **Show the work.** `explain` prints each formula with the numbers in it, `rate needed for` and `amortization needed for` solve from a budget, and `check` prints PASS or FAIL.
- **Two back ends and a playground.** A tree walking interpreter and a compiler to standalone JavaScript, tested to agree byte for byte. The playground has highlighting, live results, errors with a caret, a box per input, share links and one card per plan on a phone.
- **Scenarios, not contract terms.** The playground and docs/LANGUAGE.md say plainly that long amortizations, held payment projections and trigger rates are arithmetic, and that the contract sets the real limits.

### Renew next to a spreadsheet

A careful spreadsheet can do every calculation Renew does, and a well built one can add validation, a comparison layout and a note on where each rate came from. Renew makes those the default instead of something someone has to build. A rate typed as 5 instead of 5% is refused with "Add a percent sign, like 5%." Money added to a rate is refused, naming both types. A second option is `scenario "Offered" from "Renewal"` plus the one line that changes. A 1 year term next to a 5 year term, or a posted rate next to an offer, gets a note under the table, and `over 5 years` puts every plan on the same months. `break even` and `rate needed for` are one line each where Goal Seek is one cell at a time. `check` prints PASS or FAIL. A posted rate keeps its series and week, even in compiled output. A Renew program is plain text, so a change is a readable diff, and `compile` turns it into JavaScript for an app. Where a spreadsheet is better: charts, a familiar grid, and free form what ifs.

### How I built it

Plain JavaScript with no dependencies. The pipeline is lexer, recursive descent parser, checker, then either the interpreter or the compiler.

- The **lexer** is line based and understands money, percentages, dates, thousands separators and indentation, and joins continued lines.
- The **parser** handles precedence for comparison, addition, multiplication and unary minus, and attaches indented settings to the open block.
- The **checker** resolves names in order, applies the unit rules, makes sure every plan has its required settings, folds posted rate lookups to the cited value and week, and records a type on every expression.
- The **interpreter** walks the checked tree and works out plans lazily.
- The **compiler** lowers the same checked tree to JavaScript: typed operations become plain arithmetic, money comparisons round to the cent, posted rates become constants with a comment naming the series and week, and each statement carries a comment with its source line. The output embeds the maths kernel and runs with `node plan.js` with no imports. Its body is a `run(inputs)` function.

The maths is the standard blended payment with the rate converted per payment, `i = (1 + r / c) ^ (c / p) - 1`. Compounding is half yearly by default, the usual Canadian convention for fixed rate mortgages. That default is a modelling choice, not something the law imposes on the calculation. The Interest Act, s. 6, requires a blended payment mortgage to state the rate "calculated yearly or half-yearly, not in advance"; it is a condition on recovering interest, not a rule that the calculation must use one of those bases. Renew supports both of those bases, and monthly as well. The schedule rounds interest to the cent each period and lets the last payment absorb the rounding. At a renewal, or at a change in a rate path without `payment held`, the payment is worked out again on the balance left, over the rest of the amortization. Break even works out every grid value for rates and lengths of time. For money it uses a certified search: a bound on how fast the measure can move per dollar, from the highest rate in the plan over the horizon and widened by a quarter, lets it skip a stretch only when the answer cannot change inside it, and every other stretch is split down to single cents. If that takes more than 150,000 evaluations, or a plan stops repaying inside the horizon, it falls back to 20,001 evenly spaced amounts, and the note says so. While it searches, each plan is worked out only up to the horizon, which a test checks against the whole plan.

`three months interest` is a planning figure: balance at term end times rate times 3/12. It is not a prepayment charge, which contracts set for themselves. The Interest Act, s. 10 (1), gives a statutory three months interest right only where the mortgage money is not payable until more than five years after the mortgage date, and only after those five years. Section 10 (2) (a) excludes mortgages given by a joint stock company or any other corporation and debentures they issue that are secured by a mortgage, and s. 10 (2) (b) excludes prescribed mortgages and prescribed debentures of a prescribed entity. Renew does not model s. 10; whether it applies to a renewed charge depends on the mortgage documents.

### Challenges

Making errors useful. Every error has a line, a column, a caret under the problem and a hint, and unknown words get a "did you mean" from edit distance. Making two back ends agree: the compiler and interpreter share one maths kernel and are tested against each other on every example and 300 random programs, byte for byte. Proving the maths without trusting that kernel: a separate Python calculation with decimal arithmetic reproduces 13 cases to the cent, and it found one real rounding difference for accelerated payments at a rate change, now fixed. Keeping data honest: the posted rate table is a cited copy, and the language refuses to extrapolate.

### Accomplishments

1,365 automated checks pass, and GitHub Actions runs them on every push before the playground is published (badge in the README). Grouped by feature:

- **Core language** (145): the maths against closed forms, including $100,000 at 5% over 25 years giving $581.60 a month (`test_math.mjs`, 48), and the language and its error messages, with 25 error cases checked for line, column and hint (`test_language.mjs`, 97).
- **Comparing plans** (152): equal horizons, `renews at`, sweeps, the `variable` label, the rule that it needs something that changes the rate, and payoff assumptions (`test_horizons_and_sweeps.mjs`, 68); the payment after renewal, `against`, the posted against typed note, the balance note, variable rate warnings, percentage points and the 2026 example (`test_fair_comparisons.mjs`, 84).
- **Rates that change** (157): rate paths and renewal paths with their explain lines, `amortization to fit`, continuation lines, inputs, `compile --module` and `npm run rates` against a saved download (`test_paths_break_even_inputs.mjs`, 108); `payment held` against an adjustable payment on the same path, the trigger rate formula, the error at the trigger rate, renewal after a held payment term, and the 106 year payoff just under the trigger with its note (`test_payment_held.mjs`, 49).
- **Answers and inputs** (164): break even on every setting, with each answer checked by working out the plan at the grid value either side without the search, a non-monotonic case that crosses twice, made-up answers that change two and four times a few grid steps apart (all found), a brute force over all 30,001 renewal rates that agrees with the search, the short `vs` form, and example 07 (`test_break_even.mjs`, 72); the certified money search: its bound checked on 5,000 random pairs, five brute force cases over every cent of a window, and a case with two changes 29 cents apart that the old $500 spacing missed (`test_certified_money.mjs`, 30); the one input rule in `run()`, compiled code, the ES module, the command line and the playground (`test_inputs.mjs`, 20); `--json` with `value`, `type`, `raw` and `units`, the embed module matching a fresh compile, and the documented `run(inputs)` contract, its error messages and the README snippet (`test_json_and_embed.mjs`, 42).
- **Independent figures** (131): 13 cases from `tests/verify/independent.py`, a Python calculation that shares no code with Renew, covering several rate changes, extra and lump payments, accelerated and weekly payments, monthly compounding, short horizons and five `payment held` cases, one held just under the trigger, must match the interpreter and the compiled code to the cent (`test_independent.mjs`).
- **Agreement and command line** (616): 7 examples and 300 random programs, compiled and interpreted, must give the same report byte for byte and the same result blocks; every random program uses every statement and measure, rate paths, `payment held` and inputs, and every tenth one also has `break even` on a random setting (`test_compiler.mjs`, 610); and the command line (`test_cli.mjs`, 6).

Agreement between the back ends does not prove the maths, since they share a kernel; that is what the closed form and Python checks are for. A browser check runs every example, the limits box, the input box, the `payment held` example, the embed page and the minimal page at desktop and phone widths, with zero axe-core violations in 36 page states under WCAG 2.2 AA and best practice rules on November 19, 2026, America/Toronto. That is an automated check, not a full audit. No borrower has used Renew in a recorded session yet; formal user testing is still to come. What I did instead, and label as such, is a structured self walkthrough of the playground against usability heuristics (docs/WALKTHROUGH.md). It found a comparison table cut off beside the editor, example comments cut off, an error that pointed 3 lines below the real mistake, and an error that suggested the very name that was typed. All four are fixed and tested. It is a self review, not user testing.

### What I learned

Units as types catch the mistakes people actually make with money. A language for a narrow domain can stay small and still be expressive when its nouns are the domain's nouns. And a second, separate calculation is worth writing even when two back ends already agree: it was the only check that could find a mistake they shared.

### What's next

Contract terms as optional settings (a maximum amortization, a prepayment limit, what happens at the trigger rate), formal user testing with borrowers (none has been done yet), and a language server for editor hover help.

### Team

Solo project by John Khan, Toronto, Ontario. I am a current student and above the age of majority in Ontario. ALENZACODES is my personal GitHub handle, not a company or a team. Renew was created during the hackathon. Syntax Summit runs from July 18, 2026 to January 14, 2027, and the first commit, a68815d, is from November 19, 2026. No third party code ships in the language or the playground. Playwright and axe-core were used as test tools only.

## Built with

javascript, node.js, html, css, github-pages, github-actions, bank-of-canada-valet-api, playwright, axe-core

## Try it out links

- Playground: https://alenzacodes.github.io/renew-lang/playground/
- Embed example: https://alenzacodes.github.io/renew-lang/examples/embed.html
- Smallest integration: https://alenzacodes.github.io/renew-lang/examples/minimal.html
- Integration guide: https://github.com/ALENZACODES/renew-lang/blob/main/docs/INTEGRATION.md
- Repository: https://github.com/ALENZACODES/renew-lang
- Language reference: https://github.com/ALENZACODES/renew-lang/blob/main/docs/LANGUAGE.md
- Design notes: https://github.com/ALENZACODES/renew-lang/blob/main/docs/DESIGN.md

## Video demo link (up to 5 minutes)

Silent walkthrough, 2 minutes 11 seconds, with on screen captions and no voice: https://youtu.be/TGtrxLvYONo (unlisted). The same file is at `docs/demo/renew-walkthrough.mp4` in the repository. It was recorded at commit 40986a4 and has not been re-recorded, so it shows an earlier version.

### What changed since the video

The video is kept as it was recorded, at commit 40986a4. Since then: equal horizons with `over`; `renews at` and renewal paths; sweeps and `against`; rate paths inside the term; `payment held` and the trigger rate; `break even` on any setting, which now works out every rate and every month in its range; the time to pay off just under the trigger reported as it is, with its note; `input` and its boxes; `--json`, `compile --module` and the embed page; the variable rate warnings; stacked cards on phones; the certified money search for break even; the short `vs` form; the rule that `variable` needs something that changes the rate; the "Scenarios, not contract terms" box; the minimal page and docs/INTEGRATION.md; and the test count, from 458 at the video to 1,365 now. The gallery GIF and screenshots were captured from v1.6.0. The live playground and the README show v1.7.0, the current build. The video itself is unchanged.

### What the video shows, and what it does not

The video shows, at commit 40986a4: `mortgage` and `scenario` blocks and the report; a `check`; adding a three year option; a unit error with its caret and hint, then the fix; solving from a budget with `rate needed for` and `amortization needed for`; accelerated biweekly payments, extra payments and a lump sum; the compiled JavaScript; the language summary; and a closing card that says 458 checks, the count at that commit.

The video predates, and so does not show: `compare ... over` equal horizons; `renews at`; sweeps and `against`; the "Payment after term" column and `renewal payment`; the variable rate warnings; the note on posted rates next to typed ones; percentage points; `paid`; rate paths inside the term; multi step renewal paths; `payment held` and the trigger rate; `break even` on any setting; `amortization to fit` and `amortization remaining from`; continued lines; `input` and its playground boxes; `compile --module`, `--input` and `--json`; the embed page; `npm run rates`; stacked cards on phones; and everything new in v1.7.0, listed above. The test count is now 1,365. Gallery image 1 is a 24 second silent GIF of v1.6.0, made by automated browser capture. It is a gallery image, not a new video. Gallery image 2 puts the video build and the current build side by side on the same input. The README and the live playground show the current version, v1.7.0.

## Image gallery

1. `docs/screenshots/15-current-build.gif`: a 24 second silent capture of v1.6.0, no voice. The discount input at 1.5% gives a break even of 4.889%, with the note that every rate from 0% to 30% was worked out; typing 1% in the box, without editing the program, moves it to 5.388%; then the `payment held` example, the trigger boundary example at 106 years 1 month with its note, the compiled JavaScript and the embed page
2. `docs/screenshots/00-before-after.png`: before and after, the same two plan comparison at phone width in the video build (commit 40986a4) and now (also the thumbnail)
3. `docs/screenshots/13-payment-held.png`: an adjustable payment against `payment held` on the same rate path, with the time to pay off and the trigger rate
4. `docs/screenshots/14-embed.png`: `examples/embed.html`, a page drawn from the compiled module's raw numbers
5. `docs/screenshots/11-break-even-input.png`: the discount input set to 1% and the break even, 5.388%, with its grid note
6. `docs/screenshots/10-rate-paths.png`: a rate path inside the term and a two step renewal path, with each change explained
7. `docs/screenshots/05-mobile.png`: phone layout, one card per plan
8. `docs/screenshots/01-playground.png`: the 2026 renewal example
9. `docs/screenshots/06-horizon-sweep.png`: the 2026 example's forward comparison over 5 years, with its notes
10. `docs/screenshots/08-sweep-against.png`: the renews sweep with the payment after term, against the 5 year offer
11. `docs/screenshots/09-variable-warning.png`: a plan marked variable, with the warning under its table and its value
12. `docs/screenshots/02-budget.png`: solving backwards from a budget, with a failing check
13. `docs/screenshots/03-error.png`: a unit error with caret and hint
14. `docs/screenshots/04-compiled.png`: compiled JavaScript
15. `docs/screenshots/07-sweep-type-error.png`: a sweep with a missing percent sign, refused with a caret and a hint
16. `docs/screenshots/16-trigger-boundary-payoff.png`: just under the trigger, 106 years 1 month to pay off, with the note that it is a mathematical projection, not a contract term
17. `docs/screenshots/17-break-even-guarantee.png`: the break even note, which says every rate on the grid from 0% to 30% was worked out

## Prize categories to tick, if the form offers them

Most Innovative DSL, Best Interpreter, Best Compiler, Best Technical Implementation, Best User Experience, Future of Programming Award.
