# Devpost submission draft: Renew, Syntax Summit

Draft only. Not submitted and no Devpost project page has been created.

## Project name

Renew

## Elevator pitch (200 characters max)

Renew is a small typed language for Canadian mortgage renewals. Write the choices as a program, see every formula, compile it to JavaScript. Real Bank of Canada posted rates built in.

## Thumbnail (3:2)

`docs/screenshots/thumbnail-3x2.png`

## About the project

### Inspiration

When a mortgage term ends in Canada, the borrower gets a few weeks to choose. Renew for five years at today's rate? Take a shorter term and decide again later? Change the amortization to keep the old payment? Each choice is a small calculation, usually done in a spreadsheet or in an online calculator that answers one case at a time. A renewal decision already has the shape of a program: some facts, a few alternatives, and checks like "the payment must stay under my budget". So I wrote the language for it.

Renew is for a borrower coming up to renewal who is comfortable editing a short text file, and for developers who want renewal maths they can read, test and compile into their own page.

### What it does

Renew programs read like the conversation at renewal time:

```
mortgage "Renewal"
  balance $441,063.33
  rate posted 5 year on 2026-11-18 fixed
  amortization 20 years
  term 5 years

input discount = 1.5%

scenario "Offered 5 year" from "Renewal"
  rate posted 5 year on 2026-11-18 - discount fixed

scenario "Offered 1 year, then decide" from "Renewal"
  rate posted 1 year on 2026-11-18 - discount fixed
  term 1 year

scenario "Variable, one path" from "Renewal"
  rate 4.2% then 3.95% after 6 months

compare all by payment, interest, paid, balance
    over 5 years
sweep "Offered 1 year, then decide" renews from 3.5% to 6% step 0.5%
    by payment, interest over 5 years
    against "Offered 5 year"
show break even renews for "Offered 1 year, then decide" against "Offered 5 year"
    by interest over 5 years
explain "Offered 5 year"
check payment of "Offered 1 year, then decide" <= $3,100
show rate needed for "Renewal" at $3,000
```

The posted rate is the Bank of Canada benchmark. The offers apply the same discount to the 1 and 5 year posted rates, so offers are compared with offers; 1.5 points is an example input. In the bundled 2026 example the sweep shows the 1 year offer costing less interest over 5 years than the 5 year offer if it renews at 4.5% next year ($87,921.40 against $94,169.01) and more if it renews at 5% ($95,967.52). The `break even` line gives the exact crossing, 4.889%, with the interest at 4.888% ($94,162.75, less than $94,169.01) and at 4.889% ($94,178.85, not less) in a note. The sweep table shows the payment after renewal at each rate, $2,556.96 to $3,120.04 a month. The discount is an `input`, so it has a box in the playground: at 1 point the break even moves to 5.388%.

- **Typed units.** Money, percentages, lengths of time, numbers and dates are types. `rate 5` is refused with "Add a percent sign, like 5%." and `$5 * $5` is refused before anything runs. `$400,000 * 1%` is `$4,000.00`.
- **Scenarios as differences.** A scenario copies a mortgage and changes only what it states, so each comparison isolates one decision.
- **Fair comparisons.** A 1 year term and a 5 year term do not cover the same months, so their interest figures are not like for like. `compare ... over 5 years` follows every plan for the same 5 years, and a note under the table says what was assumed after a shorter term. Without `over`, a comparison of plans with different terms carries a warning. Notes also flag posted rates next to typed ones, and explain why interest over the same months already counts the balance left. A rate minus a rate prints in percentage points.
- **Rate paths.** `rate 5.2% then 4.7% after 12 months` changes the rate inside the term. `renews at 4.5% then 5% after 1 year` renews in steps. Each `after` counts from the change before it. At every change the payment is worked out again on the balance left over the rest of the amortization, and `explain` lists each change with its date, balance and new payment. Any table with a plan that renews shows the new payment in a "Payment after term" column. A path makes the plan variable, a path on a plan marked `fixed` is an error, and the note says it is one path, not a forecast. Without a path, `fixed` and `variable` are labels, and every result involving a plan marked `variable` carries a warning that says so. Variable mortgages that keep the payment fixed and let the amortization move are not modelled.
- **Break even.** `break even renews for "A" against "B" by interest over 5 years` finds the renewal rate, to a thousandth of a percent, at which A stops costing less than B over the horizon.
- **Inputs.** `input discount = 1.5%` is a value that can change without editing the program: a box in the playground, `renew run --input discount=1%`, `--discount=1%` on a compiled file, or `run({ discount: "1%" })` from code.
- **Amortization helpers.** `amortization to fit payment of "Signed in 2021"` picks the shortest amortization whose payment fits. `amortization remaining from "Signed in 2021"` is that plan's amortization minus its term.
- **Long lines.** A trailing comma, or an indented line starting with `by`, `over`, `against` or `then`, carries on the line above, and errors still point at the right line.
- **Sweeps.** `sweep "Renewal" rate from 4% to 7% step 0.5%` gives one row per value. The values are type checked against the setting, so `from 4 to 7%` is refused with a hint. `against "Plan"` adds a fixed plan as the last row for comparison.
- **Posted rates.** `posted 5 year on DATE` reads a bundled copy of the Bank of Canada weekly series V80691333, V80691334 and V80691335, which the Bank describes as the interest rate for a 1-year, 3-year or 5-year conventional mortgage offered by chartered banks in Canada (January 2016 to November 18, 2026). These are posted rates, a reference point, not a quote and not a limit. A date before the first week is an error. By Renew's own policy, not a Bank rule, a date up to six days after the last week reads that week and a later date is an error that says to type the rate or run `npm run rates`, which downloads the series again and changes nothing if the download looks wrong. Renew never guesses a rate.
- **Show the work.** `explain` prints each formula with the real numbers substituted.
- **Solve backwards.** `rate needed for` and `amortization needed for` find the input that fits a budget.
- **Checks.** `check` turns a rule of thumb into a pass or fail line.
- **Two back ends.** A tree walking interpreter, and a compiler that emits standalone JavaScript, or an ES module exporting `run(inputs)` with `compile --module`.
- **Playground.** Edit in the browser with highlighting, live results, errors with a caret and a "go to line" button, tabs for the compiled JavaScript and the syntax tree, a box for each `input`, share links that carry the whole program, and comparison tables that turn into one card per plan on a phone.

### Renew next to a spreadsheet

A careful spreadsheet can do every calculation Renew does, and a well built one can add validation, a comparison layout and a note on where each rate came from. Renew makes those the default instead of something someone has to build. A rate typed as 5 instead of 5% is refused with "Add a percent sign, like 5%." Money added to a rate is refused, naming both types. A second option is `scenario "Offered" from "Renewal"` plus the one line that changes. A 1 year term next to a 5 year term, or a posted rate next to an offer, gets a note under the table, and `over 5 years` puts every plan on the same months. `rate needed for` is one line where Goal Seek is one cell at a time. `check` prints PASS or FAIL. A posted rate keeps its series and week, even in compiled output. A Renew program is plain text, so a change is a readable diff, and `compile` turns it into JavaScript for an app. Where a spreadsheet is better: charts, a familiar grid, and free form what ifs.

### How I built it

Plain JavaScript with no dependencies. The pipeline is lexer, recursive descent parser, checker, then either the interpreter or the compiler.

- The **lexer** is line based and understands money, percentages, dates, thousands separators and indentation, and joins continued lines.
- The **parser** handles precedence for comparison, addition, multiplication and unary minus, and attaches indented settings to the open block.
- The **checker** resolves names in order, applies the unit rules, makes sure every plan has its required settings, folds posted rate lookups to the cited value and week, and records a type on every expression.
- The **interpreter** walks the checked tree and works out plans lazily.
- The **compiler** lowers the same checked tree to JavaScript: typed operations become plain arithmetic, money comparisons round to the cent, posted rates become constants with a comment naming the series and week, and each statement carries a comment with its source line. The output embeds the maths kernel and runs with `node plan.js` with no imports. Its body is a `run(inputs)` function, so inputs can be passed in.

The maths is the standard blended payment with the rate converted per payment, `i = (1 + r / c) ^ (c / p) - 1`. Compounding is half yearly by default, the usual Canadian convention for fixed rate mortgages. That default is a modelling choice, not something the law imposes on the calculation: the Interest Act, s. 6, is a disclosure rule, under which a blended payment mortgage must state the rate "calculated yearly or half-yearly, not in advance". Renew supports both of those bases, and monthly as well. The schedule rounds interest to the cent each period and lets the last payment absorb the rounding. With `renews at`, or at any step of a rate path, the payment is worked out again on the balance left, over the rest of the amortization. Break even halves the range from 0% to 30% until it is a thousandth of a percent wide.

`three months interest` is a planning figure: balance at term end times rate times 3/12. It is not a prepayment charge, which contracts set for themselves. The Interest Act, s. 10 (1), gives a statutory three months interest right only where the mortgage money is not payable until more than five years after the mortgage date, only after those five years, s. 10 (2) (a) excludes mortgages given by a joint stock company or other corporation, and s. 10 (2) (b) excludes prescribed mortgages given by a prescribed entity. Renew does not model s. 10; whether it applies to a renewed charge depends on the mortgage documents.

### Challenges

Making errors useful. Every error has a line, a column, a caret under the problem and a hint, and unknown words get a "did you mean" from edit distance. Making two back ends agree: the compiler and interpreter share one maths kernel and are tested against each other on every example and 300 random programs, byte for byte. Keeping data honest: the posted rate table is a cited copy, and the language refuses to extrapolate.

### Accomplishments

703 automated checks pass, and GitHub Actions runs them on every push before the playground is published (badge in the README):

- 48 on the maths against closed forms, including $100,000 at 5% over 25 years giving $581.60 a month.
- 97 on the language and its error messages.
- 68 on equal horizons, `renews at`, sweeps, the `variable` label, payoff assumptions, and runtime errors that must read the same from both back ends. The horizon and `renews at` figures were also reproduced with a separate Python calculation using decimal cent rounding.
- 307 on compiler and interpreter agreement: 4 examples and 300 random programs that must match byte for byte, plus 3 checks that compiled code needs no `require`, folds posted rates in as cited constants and comments each source line. Every random program uses every statement, including `compare ... over` and `sweep`, every measure, both solvers, posted and typed rates, every compounding choice and payment frequency, `extra`, `lump`, `renews at`, both rate labels, `against`, `renewal payment`, a rate difference, and since round 4 an `input`, a rate path, a renewal path, `amortization to fit`, `amortization remaining from`, two `break even` values and continued lines. Error paths are tested separately.
- 71 on the round 3 changes: the payment after renewal in sweeps and comparisons ($2,789.75 at 4.5% and $3,255.96 at 6.5% for the posted 1 year term), `against`, the posted against typed note, the balance note, variable rate warnings, percentage points, `paid`, `remaining` (now refused when bare), two error hints from my own walkthrough, the rebuilt 2026 example, and the wording of the language reference. Its figures were also reproduced with the separate Python calculation.
- 106 on the round 4 changes: a rate path and a two step renewal path with their payments, interest, balances and explain lines reproduced in the separate Python calculation; path errors; break even for the 2026 example (4.889%), with both figures in its note matched to ordinary comparisons at 4.888% and 4.889%; `amortization to fit` and `remaining from`; continuation lines; `input` overrides and their unit errors; compiled `run(inputs)`, `compile --module` imported as a real module and `--input` on the command line; and `npm run rates` against a saved sample of the Bank of Canada download.
- 6 on the command line.

Agreement between the back ends does not prove the maths, since they share a kernel; that is what the closed form and Python checks are for. The playground had zero axe-core violations under WCAG 2.2 AA and best practice rules at desktop and phone widths on November 19, 2026, America/Toronto, after this round's deploy. That is an automated check, not a full audit. No borrower has used Renew in a recorded session yet; formal user testing is still to come. What I did instead, and label as such, is a structured self walkthrough of the playground against usability heuristics (docs/WALKTHROUGH.md). It found a comparison table cut off beside the editor, example comments cut off, an error that pointed 3 lines below the real mistake, and an error that suggested the very name that was typed. All four are fixed and tested. It is a self review, not user testing.

The third outside review asked for rate paths inside a term and in steps after it, an exact break even, stacked tables on phones, a way to refresh the posted rates, a meaning for `remaining`, line continuation and inputs. All of those are in this version and covered by `test_round4.mjs` and the browser check. Running `npm run rates` on November 19, 2026 found no week after November 18, 2026, so the bundled rates did not change. The playground had zero axe-core violations at desktop and phone widths after this deploy too.

### What I learned

Units as types catch the mistakes people actually make with money. A language for a narrow domain can stay small and still be expressive when its nouns are the domain's nouns.

### What's next

Variable mortgages that keep the payment fixed and let the amortization move, formal user testing with borrowers (none has been done yet), and a language server for editor hover help.

### Team

Solo project by John Khan, Toronto, Ontario, a current student. No third party code ships in the language or the playground. Playwright and axe-core were used as test tools only.

## Built with

javascript, node.js, html, css, github-pages, github-actions, bank-of-canada-valet-api, playwright, axe-core

## Try it out links

- Playground: https://alenzacodes.github.io/renew-lang/playground/
- Repository: https://github.com/ALENZACODES/renew-lang
- Language reference: https://github.com/ALENZACODES/renew-lang/blob/main/docs/LANGUAGE.md
- Design notes: https://github.com/ALENZACODES/renew-lang/blob/main/docs/DESIGN.md

## Video demo link (up to 5 minutes)

Silent walkthrough, 2 minutes 11 seconds, with on screen captions and no voice: https://youtu.be/TGtrxLvYONo (unlisted). The same file is at `docs/demo/renew-walkthrough.mp4` in the repository. It was recorded at commit 40986a4 and has not been re-recorded, so it shows an earlier version.

### What the video shows, and what it does not

The video shows, at commit 40986a4: `mortgage` and `scenario` blocks and the report; a `check`; adding a three year option; a unit error with its caret and hint, then the fix; solving from a budget with `rate needed for` and `amortization needed for`; accelerated biweekly payments, extra payments and a lump sum; the compiled JavaScript; the language summary; and a closing card that says 458 checks, the count at that commit.

The video predates, and so does not show: `compare ... over` equal horizons; `renews at`; sweeps and `against`; the "Payment after term" column and `renewal payment`; the variable rate warnings; the note on posted rates next to typed ones; percentage points; `paid`; rate paths inside the term; multi step renewal paths; `break even`; `amortization to fit` and `amortization remaining from`; continued lines; `input` and its playground boxes; `compile --module` and `--input`; `npm run rates`; and stacked cards on phones. The test count is now 703. Gallery image 1 puts the video build and the current build side by side on the same input. The README, the screenshots and the live playground show the current version.

## Image gallery

1. `docs/screenshots/00-before-after.png`: before and after, the same two plan comparison at phone width in the video build (commit 40986a4) and now (also the thumbnail)
2. `docs/screenshots/10-rate-paths.png`: a rate path inside the term and a two step renewal path, with each change explained
3. `docs/screenshots/11-break-even-input.png`: the discount input set to 1% and the exact break even, 5.388%
4. `docs/screenshots/05-mobile.png`: phone layout, one card per plan
5. `docs/screenshots/01-playground.png`: the 2026 renewal example
6. `docs/screenshots/06-horizon-sweep.png`: the 2026 example's forward comparison over 5 years, with its notes
7. `docs/screenshots/08-sweep-against.png`: the renews sweep with the payment after term, against the 5 year offer
8. `docs/screenshots/09-variable-warning.png`: a plan marked variable, with the warning under its table and its value
9. `docs/screenshots/02-budget.png`: solving backwards from a budget, with a failing check
10. `docs/screenshots/03-error.png`: a unit error with caret and hint
11. `docs/screenshots/04-compiled.png`: compiled JavaScript
12. `docs/screenshots/07-sweep-type-error.png`: a sweep with a missing percent sign, refused with a caret and a hint

## Prize categories to tick, if the form offers them

Most Innovative DSL, Best Interpreter, Best Compiler, Best Technical Implementation, Best User Experience, Future of Programming Award.
