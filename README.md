# Renew

**A small language for Canadian mortgage renewal decisions.**

**Playground:** https://alenzacodes.github.io/renew-lang/playground/

![The Renew playground running the 2026 renewal example](docs/screenshots/01-playground.png)

When a mortgage term ends, the borrower has a few weeks to compare a handful of choices: renew for five years, take a shorter term, stretch the amortization to keep the payment, pay extra. Each choice is a small calculation, and most people do it in a spreadsheet they cannot check or a calculator that hides its maths. Renew turns the decision into a short program you can read, run, share and rerun when rates move.

```renew
mortgage "Signed in 2021"
  balance $500,000
  rate posted 5 year on 2021-11-17 fixed
  amortization 25 years
  term 5 years

let left = balance of "Signed in 2021"

mortgage "Renewal"
  balance left
  rate posted 5 year on 2026-11-18 fixed
  amortization 20 years
  term 5 years

scenario "One year, then decide" from "Renewal"
  rate posted 1 year on 2026-11-18
  term 1 year

scenario "Keep the old payment" from "Renewal"
  amortization 25 years

compare all by payment, interest, balance, payoff
show payment of "Renewal" - payment of "Signed in 2021"
explain "Renewal"
check payment of "Keep the old payment" <= payment of "Signed in 2021" * 1.1
```

Output:

```
Compare
Plan                   Payment            Interest in term  Balance at term end  Time to pay off
=====================  =================  ================  ===================  ===============
Signed in 2021         $2,848.54 monthly  $111,975.73       $441,063.33          25 years
Renewal                $3,188.39 monthly  $125,388.61       $375,148.54          20 years
One year, then decide  $3,016.17 monthly  $23,632.54        $428,501.83          20 years
Keep the old payment   $2,871.96 monthly  $128,543.63       $397,289.36          25 years

payment of "Renewal" - payment of "Signed in 2021" = $339.85
...
PASS  payment of "Keep the old payment" <= payment of "Signed in 2021" * 1.1  ($2,871.96 <= $3,133.39)
```

The rates are real: `posted 5 year on 2021-11-17` reads 4.79% and `posted 5 year on 2026-11-18` reads 6.19% from the Bank of Canada weekly series for a conventional mortgage offered by chartered banks. The loan amounts are example inputs.

## What makes it a language

- **Units are types.** `$`, `%`, `years` and `months` are part of the syntax. `rate 5` is refused with `Add a percent sign, like 5%.` and `$5 * $5` is refused before anything runs.
- **Scenarios are differences.** A scenario copies a mortgage and states only what changes.
- **It shows its work.** `explain` prints every formula with the real numbers in it.
- **It works backwards.** `rate needed for "Renewal" at $2,600` and `amortization needed for "Renewal" at $2,600` solve for the input that fits a budget.
- **Two back ends.** A tree walking interpreter, and a compiler that turns a program into self contained JavaScript. Both are tested to give byte identical reports.
- **Errors that teach.** Line, column, a caret under the problem, and the closest valid word.

## Use it

In the browser: open the [playground](https://alenzacodes.github.io/renew-lang/playground/). Pick an example, edit, and the report updates as you type. Tabs show the compiled JavaScript and the syntax tree. **Copy share link** puts the whole program in the link.

On the command line, with Node 18 or newer and no installs:

```bash
node bin/renew.js run examples/01-renewal-2026.renew
node bin/renew.js check examples/03-budget.renew
node bin/renew.js compile examples/02-pay-it-down.renew > plan.js && node plan.js
```

## Documentation

- [docs/LANGUAGE.md](docs/LANGUAGE.md): grammar, types, measures, the maths and its sources, posted rates, errors.
- [docs/DESIGN.md](docs/DESIGN.md): design principles and how the lexer, parser, checker, interpreter and compiler fit together.
- [examples/](examples/): a 2026 renewal, ways to pay down faster, working back from a budget, and the smallest program.

## Tests

```bash
npm test
python3 tests/browser_check.py http://127.0.0.1:8080/playground/ path/to/axe.min.js
```

- `test_math.mjs` (48 checks): the payment formula against closed forms, five rate and frequency mixes, zero rates, accelerated payments, extra and lump sums, the solvers, and formatting. Includes the classic $100,000 at 5% over 25 years, $581.60 a month.
- `test_language.mjs` (97 checks): values and units, scenario inheritance, comments and line endings, checks, posted rate lookup, and 25 error cases with their line, column and hint.
- `test_compiler.mjs` (307 checks): every example and 300 random programs, compiled and interpreted, must match byte for byte; compiled code runs in a sandbox with no `require`.
- `test_cli.mjs` (6 checks): run, check, compile and exit codes.
- `browser_check.py`: every example at desktop and phone width, the error state, keyboard tab switching, no sideways scroll, and axe-core with WCAG 2.2 AA rules. Zero violations on November 19, 2026.

## Project layout

```
src/kernel.js        maths and report formatting, shared by both back ends
src/renew.js         lexer, parser, checker, interpreter, compiler
src/posted_rates.js  generated from data/posted_rates.json
bin/renew.js         command line
playground/          browser playground, no build step
examples/            sample programs
tests/               Node tests and the browser check
```

## Sources

- Interest Act, R.S.C. 1985, c. I-15, ss. 6 and 10: https://laws-lois.justice.gc.ca/eng/acts/I-15/page-1.html
- Bank of Canada, Valet series V80691333, V80691334 and V80691335, retrieved November 19, 2026, America/Toronto: https://www.bankofcanada.ca/valet/observations/V80691333,V80691334,V80691335/csv?start_date=2016-01-01 (terms: https://www.bankofcanada.ca/terms/)

Renew is a planning tool. It is not financial advice and it does not quote lender rates.

## Credits

Designed and built by John Khan, Toronto, Ontario, for Syntax Summit. Solo project. No third party code ships in the language or the playground. Playwright and axe-core are used only as test tools.

## License

MIT. See [LICENSE](LICENSE).
