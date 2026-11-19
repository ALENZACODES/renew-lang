# Design notes

## Why a language

A renewal decision is a small program that people already run by hand. Take the balance left at renewal, try three or four rates and terms, ask what each costs, and check each against a budget. A spreadsheet can hold that logic, but it lives in cells that are easy to break and hard to review unless someone builds the checks. Online calculators answer one case at a time and rarely show their maths. Renew makes the decision a short text file that can be read top to bottom, changed in one place, shared as a link and run again when rates move.

## Principles

1. **Read like the conversation.** `scenario "Offered 1 year, then decide" from "Renewal"` then `term 1 year`. Settings are words people use at renewal time.
2. **Units are types.** Money, percentages and lengths of time cannot be mixed by accident. Most renewal mistakes are unit mistakes: a rate typed as 5 instead of 5%, a term typed as 5 instead of 5 years. Renew catches those before it runs.
3. **Scenarios are differences.** A scenario copies a mortgage and states only what changes, so a comparison shows the effect of one decision at a time.
4. **Show the work.** `explain` prints each formula with the real numbers substituted. The playground shows the syntax tree and the compiled JavaScript next to the result.
5. **Never invent a number.** Rates are either written by the user or read from a cited Bank of Canada table. Dates outside the table are errors, not guesses.
6. **Errors teach.** Every error names the line and column, draws a caret, and suggests the fix or the closest valid word.

## Pipeline

```
source  ->  lex  ->  parse  ->  check  ->  run      (tree walking interpreter, src/renew.js)
                                       ->  compile  (JavaScript, src/renew.js)
```

- **Lexer.** Line based. Recognises money, percentages, dates, numbers with thousands separators, quoted names, words and operators. It records whether each line is indented, and joins a line that ends with a comma, or an indented line that starts with `by`, `over`, `against` or `then`, onto the line above. Tokens keep their own line and column, so errors still point at the right place.
- **Parser.** Recursive descent with operator precedence: comparison, then plus and minus, then times and divide, then unary minus. Indented lines attach to the open block.
- **Checker.** Resolves plan names and `let` and `input` names in order, applies the type rules, folds `posted` lookups to the cited rate and its week, makes sure every plan has its required settings, and annotates each expression with its type.
- **Interpreter.** Walks the checked tree. Plans are worked out lazily and cached, so a plan that is never measured is never computed.
- **Compiler.** Lowers the same checked tree to JavaScript. Typed operations become plain arithmetic (a percentage of money gets its `* 0.01`), money comparisons are rounded to the cent, `posted` lookups become constants with a comment naming the series and week, and each statement carries a comment with its source line. The output embeds the math kernel, needs no imports, and runs with `node plan.js` or in a browser. The program body is a `run(inputs)` function, so `input` values can be passed in, and `compile --module` writes an ES module that exports `run` and `inputs`.
- **Kernel.** `src/kernel.js` holds the maths and the report formatter. The interpreter calls it directly. The compiler copies its source into every compiled program, so both paths share one implementation of the maths and differ only in how the program around it is evaluated.

## How the two back ends are kept honest

`tests/test_compiler.mjs` runs every example and 300 random programs both ways, from a fixed seed, and requires the reports to match byte for byte, and the result blocks too. Each random program uses every statement (mortgage, scenario with and without `from`, `let`, `input`, `compare` with and without `over`, `sweep`, `show` of a value, `show schedule`, `show yearly`, `explain`, `check`), every measure including `trigger rate`, both solvers, posted and typed rates, all three compounding choices, all six payment frequencies, `extra`, `lump`, `renews at`, the `fixed` and `variable` labels, a rate path inside the term, `payment fixed`, a renewal path, `amortization to fit`, `amortization remaining from`, `sweep ... against`, `renewal payment`, a rate difference shown in percentage points, `break even renews` and `break even` on a randomly chosen setting, and continued lines. Three more checks confirm compiled programs have no `require`, fold posted rates in as cited constants, and carry a comment for each source line. Compiled programs run in a sandbox with `require` disabled to prove they are self contained.

Error paths are tested on their own, with the line and column of each error:

- `test_language.mjs`: lexing, parsing, type errors, names, hints and the error format.
- `test_horizons_and_sweeps.mjs`: horizon and sweep errors, and runtime errors that must read the same from the interpreter and from compiled code.
- `test_fair_comparisons.mjs`: a bare `remaining`, `total`, a scenario started from a scenario, and a plain number used as a rate.
- `test_paths_break_even_inputs.mjs`: rate path and renewal path errors, `amortization to fit` with no fit, continuation lines, and input names, units and Renew words.
- `test_fixed_payment.mjs`: `payment fixed` on a fixed rate, and a rate path that reaches the trigger rate.
- `test_break_even.mjs`: an unknown setting, `rate` on a plan with a rate path, and `renews` with a horizon no longer than the term.
- `test_inputs.mjs`: a bare number or the wrong unit for an input, in `run()`, compiled code, the ES module and on the command line.
- `test_json_and_embed.mjs` and `test_cli.mjs`: usage errors and errors on standard error with exit 1, with `--json` too.

Agreement between the two back ends does not prove the maths is right, because they share one kernel. Two kinds of test cover that. `test_math.mjs` checks the kernel against closed forms. `tests/verify/independent.py` is a separate calculation in Python with decimal arithmetic that shares no code with the kernel. It works out 12 cases from their settings: several rate changes in one term, rate changes with extra payments, a lump sum then a renewal, accelerated biweekly and weekly payments, weekly payments compounded monthly, horizons shorter than a term and just past one, and four `payment fixed` cases (one rise, a rise then a fall, a renewal after the term, and biweekly with extra payments). It writes `tests/fixtures/independent.json`, and `test_independent.mjs` requires the interpreter and the compiled code to give the same payment, interest, paid, balance and time to pay off for every case, to the cent. The horizon, renewal, 2026 example and rate path figures in the other test files were also reproduced with a Python calculation. Writing it found one real difference: for accelerated payments at a rate change, Renew divided the monthly payment by 2 or 4 before rounding it, while at the start it rounded first. The kernel now rounds first in both places. `test_break_even.mjs` checks every break even answer by working out the plan at the grid value either side without the search.

## Out of scope on purpose

Renew does not give advice, quote lender rates, qualify anyone for a loan or estimate prepayment charges set by a contract. It models the payment maths and the choices a borrower writes down.

## What the language covers

- Plans and scenarios as differences, typed settings, and `compare`, `sweep`, `show`, `explain` and `check`.
- Equal horizons with `compare ... over 5 years`, and notes whenever plans have different terms, mix posted and typed rates, or are variable.
- `renews at` and renewal paths, with the payment worked out again at renewal and shown as `Payment after term`.
- Rate paths inside the term, with an adjustable payment by default or `payment fixed`, where the payment stays the same and the time to pay off moves, with the trigger rate.
- `break even` on any setting a sweep can change, on a stated grid, with a note that lets anyone check it with two `compare` lines.
- `amortization to fit`, `amortization remaining from`, `rate needed for` and `amortization needed for`.
- `input` values, with one rule for how a value is written everywhere it can be passed in.
- `renew run --json` and `compile --module` for building on results from other code, shown in `examples/embed.html`.
- `npm run rates` to download the Bank of Canada series again, with checks before anything is replaced.

## What is next

- What a lender does when a `payment fixed` plan reaches its trigger rate. Renew stops with an error there, because lenders handle it in different ways.
- A language server for editor highlighting and hover help.
- Formal user testing with borrowers, starting with whether posted against offered rates and the payment after renewal are clear. None has been done yet.
