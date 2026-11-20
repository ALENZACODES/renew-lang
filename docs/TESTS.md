# Tests

How the Renew test files are grouped. Run them with:

```bash
npm test
python3 tests/browser_check.py http://127.0.0.1:8080/playground/ path/to/axe.min.js
```

1,295 checks pass in total. GitHub Actions runs `npm test` on every push before the playground is published. The suite also runs `python3 tests/verify/independent.py --check`, which regenerates the independent Python fixtures in memory and fails if they no longer match `tests/fixtures/independent.json`.

Core language
- `test_math.mjs` (48 checks): the payment formula against closed forms, five rate and frequency mixes, zero rates, accelerated payments, extra and lump sums, the solvers, and formatting. Includes the classic $100,000 at 5% over 25 years, $581.60 a month.
- `test_language.mjs` (97 checks): values and units, scenario inheritance, comments and line endings, checks, posted rate lookup, and 25 error cases with their line, column and hint.

Comparing plans
- `test_horizons_and_sweeps.mjs` (68 checks): equal horizons and the different term warning, `renews at`, sweeps and their type errors, the `variable` label, payoff assumptions, and runtime errors that must read the same from the interpreter and from compiled code.
- `test_fair_comparisons.mjs` (71 checks): the payment after renewal in sweeps and comparisons, `against`, the posted against typed note, the balance note, variable rate warnings, percentage points, `paid`, a bare `remaining` refused with a hint, and the 2026 example.

Rates that change
- `test_paths_break_even_inputs.mjs` (108 checks): rate paths inside the term and renewal paths, with their payments, interest, balances and explain lines; path errors; break even for the 2026 example; `amortization to fit` and `remaining from`; continuation lines; `input` overrides; compiled `run(inputs)` and `compile --module`; and `npm run rates` against a saved sample of the Valet download.
- `test_payment_held.mjs` (49 checks): `payment held` against an adjustable payment on the same path, the trigger rate formula, the error when a path reaches it, renewal after a held payment term, scenarios, the explain lines, and a trigger-rate boundary: just under the later trigger still runs, one step over is refused. Just under the trigger the time to pay off is the real one, 106 years 1 month, with the note that it is not a payoff a lender would allow; a $1 billion loan held just under its trigger still pays off (318 years 8 months) inside the 1,000 year limit; and a plan that reaches the limit is reported as not repaid, not as paid off.

Answers and inputs
- `test_break_even.mjs` (62 checks): break even on every setting, each answer checked by working out the plan at the grid value either side without the search; the grid wording; the note for `by paid`; no answer in the range; the errors; and a non-monotonic case where `by paid` against amortization crosses twice, so Renew reports several crossings and no single value. What the scan guarantees: made-up answers that change twice three grid steps apart, once one step wide, and four times close together are all found for rates (the old 400 sample scan would have missed the first); every month is tried for lengths of time; for money, the spacing is stated and a change narrower than it is shown to be missable, as the note says. A brute force over all 30,001 renewal rates for the 2026 example, and month by month for the amortization case, agrees with the search. Stopping each plan at the horizon during the search is checked against the whole plan on over 1,500 plans and horizons.
- `test_inputs.mjs` (20 checks): the one input rule in `run()`, compiled code, the ES module, the command line and the playground.
- `test_json_and_embed.mjs` (26 checks): `renew run --json`, `value` and `type`, `raw` and `units` for every kind of table, errors with `--json`, and that the embed module is the current `compile --module` output and gives 4.889% and 5.388%.

Independent figures and agreement
- `test_independent.mjs` (131 checks): 13 cases worked out by `tests/verify/independent.py`, a separate Python calculation with decimal arithmetic that shares no code with Renew, must match the interpreter and the compiled code to the cent. The cases cover several rate changes, extra and lump payments, accelerated and weekly payments, monthly compounding, short horizons and five `payment held` cases, one held just under the later trigger, where the payoff runs past 100 years. It found one real difference, accelerated payments at a rate change rounding in a different order from the start, which is now fixed.
- `test_compiler.mjs` (609 checks): 6 examples and 300 random programs, compiled and interpreted, must give the same report byte for byte and the same result blocks, plus 3 checks that compiled code has no `require`, folds posted rates in as cited constants, and comments each source line. Each random program uses every statement and measure, both solvers, posted and typed rates, all compounding choices and payment frequencies, `extra`, `lump`, `renews at`, rate and renewal paths, `payment held`, `amortization to fit` and `remaining from`, an `input`, and continued lines. Every tenth random program also has `break even renews` twice and `break even` on a random setting; the rest leave them out, because each break even now works out about 30,000 plans.
- `test_cli.mjs` (6 checks): run, check, compile and exit codes.
- `browser_check.py`: every example at desktop and phone width, the 2026 example's notes and sweep, the comparison table fitting beside the editor, the break even line, the input box rerunning the program without changing its text and refusing a value without a percent sign, the `payment held` example, the trigger-rate boundary example, the embed page with its input and its error at 1100 and 390 pixels, stacked cards with no table scrolling sideways at 390 pixels, variable rate warning boxes, compiled output run in the page matching the interpreter, the error state, keyboard tab switching, no sideways scroll, and axe-core with WCAG 2.2 AA rules. An automated check, not a full accessibility audit.
