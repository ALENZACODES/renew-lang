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

When a mortgage term ends in Canada, the borrower gets a few weeks to choose. Renew for five years at today's rate? Take a shorter term and decide again later? Stretch the amortization to keep the old payment? Each choice is a small calculation, and people do them in spreadsheets they cannot audit or in calculators that hide the maths and answer one case at a time. A renewal decision already has the shape of a program: some facts, a few alternatives, and checks like "the payment must stay under my budget". So I wrote the language for it.

Renew is for a borrower coming up to renewal who is comfortable editing a short text file, and for developers who want renewal maths they can read, test and compile into their own page.

### What it does

Renew programs read like the conversation at renewal time:

```
mortgage "Renewal"
  balance $441,063.33
  rate posted 5 year on 2026-11-18 fixed
  amortization 20 years
  term 5 years

let offered = 4.69%

scenario "Offered 5 year" from "Renewal"
  rate offered fixed

scenario "One year, then decide" from "Renewal"
  rate posted 1 year on 2026-11-18
  term 1 year

compare all by payment, interest, balance, payoff over 5 years
sweep "One year, then decide" renews from 4.5% to 6.5% step 0.5% by interest, balance over 5 years
explain "Renewal"
check payment of "One year, then decide" <= $3,100
show rate needed for "Renewal" at $3,000
```

The posted rate is the Bank of Canada benchmark. The offered rate is the one a lender quotes you, typed in next to it; 4.69% here is an example input.

- **Typed units.** Money, percentages, lengths of time, numbers and dates are types. `rate 5` is refused with "Add a percent sign, like 5%." and `$5 * $5` is refused before anything runs. `$400,000 * 1%` is `$4,000.00`.
- **Scenarios as differences.** A scenario copies a mortgage and changes only what it states, so each comparison isolates one decision.
- **Fair comparisons.** A 1 year term and a 5 year term do not cover the same months, so their interest figures are not like for like. `compare ... over 5 years` follows every plan for the same 5 years, and a note under the table says what was assumed after a shorter term. Without `over`, a comparison of plans with different terms carries a warning.
- **A simple rate path.** `renews at 5.5%` sets the rate after the term, and the payment is worked out again at renewal on the balance left. Without it, the rate is assumed to stay the same, and both `explain` and `compare` say so wherever a payoff figure appears. `fixed` and `variable` are labels; a rate that moves inside a term is not modelled yet, and `explain` says that too.
- **Sweeps.** `sweep "Renewal" rate from 4% to 7% step 0.5%` gives one row per value. The values are type checked against the setting, so `from 4 to 7%` is refused with a hint.
- **Posted rates.** `posted 5 year on DATE` reads a bundled copy of the Bank of Canada weekly series for a conventional mortgage offered by chartered banks (1, 3 and 5 year terms, January 2016 to November 18, 2026). These are posted rates, a benchmark; many borrowers are offered less. A date before the first week, or more than six days after the last week, is an error. Renew never guesses a rate.
- **Show the work.** `explain` prints each formula with the real numbers substituted.
- **Solve backwards.** `rate needed for` and `amortization needed for` find the input that fits a budget.
- **Checks.** `check` turns a rule of thumb into a pass or fail line.
- **Two back ends.** A tree walking interpreter, and a compiler that emits standalone JavaScript.
- **Playground.** Edit in the browser with highlighting, live results, errors with a caret and a "go to line" button, tabs for the compiled JavaScript and the syntax tree, and share links that carry the whole program.

### Renew next to a spreadsheet

A careful spreadsheet can do every calculation Renew does. What changes is what the format catches and keeps visible. A spreadsheet accepts a rate typed as 5 instead of 5%; Renew refuses it with "Add a percent sign, like 5%." A spreadsheet lets you add money to a rate; Renew names both types and stops. A second option in a spreadsheet is a copied block of cells; in Renew it is `scenario "Offered" from "Renewal"` plus the one line that changes. A spreadsheet does not warn you that a 1 year and a 5 year term cover different months; Renew does, and `over 5 years` fixes it. Goal Seek answers one cell at a time; `rate needed for` is one line. A rule of thumb in a spreadsheet is a formula someone has to remember to look at; `check` prints PASS or FAIL. A pasted posted rate loses its source; Renew keeps the series and week, even in compiled output. And a Renew program is plain text, so a change is a readable diff, and `compile` turns it into JavaScript for an app. Where a spreadsheet is better: charts, a familiar grid, and free form what ifs.

### How I built it

Plain JavaScript with no dependencies. The pipeline is lexer, recursive descent parser, checker, then either the interpreter or the compiler.

- The **lexer** is line based and understands money, percentages, dates, thousands separators and indentation.
- The **parser** handles precedence for comparison, addition, multiplication and unary minus, and attaches indented settings to the open block.
- The **checker** resolves names in order, applies the unit rules, makes sure every plan has its required settings, folds posted rate lookups to the cited value and week, and records a type on every expression.
- The **interpreter** walks the checked tree and works out plans lazily.
- The **compiler** lowers the same checked tree to JavaScript: typed operations become plain arithmetic, money comparisons round to the cent, posted rates become constants with a comment naming the series and week, and each statement carries a comment with its source line. The output embeds the maths kernel and runs with `node plan.js` with no imports.

The maths is the standard blended payment with the rate converted per payment, `i = (1 + r / c) ^ (c / p) - 1`. Compounding is half yearly by default, the usual Canadian convention for fixed rate mortgages. That default is a modelling choice, not something the law imposes on the calculation: the Interest Act, s. 6, is a disclosure rule, under which a blended payment mortgage must state the rate "calculated yearly or half-yearly, not in advance". Renew supports both of those bases, and monthly as well. The schedule rounds interest to the cent each period and lets the last payment absorb the rounding. With `renews at`, the payment is worked out again at the end of the term on the balance left, over the rest of the amortization.

`three months interest` is a planning figure: balance at term end times rate times 3/12. It is not a prepayment charge, which contracts set for themselves. The Interest Act, s. 10 (1), gives a statutory three months interest right only where the mortgage money is not payable until more than five years after the mortgage date, only after those five years, and s. 10 (2) excludes mortgages given by a joint stock company or other corporation. It does not apply to the 1, 3 and 5 year terms in the examples, and the docs say so.

### Challenges

Making errors useful. Every error has a line, a column, a caret under the problem and a hint, and unknown words get a "did you mean" from edit distance. Making two back ends agree: the compiler and interpreter share one maths kernel and are tested against each other on every example and 300 random programs, byte for byte. Keeping data honest: the posted rate table is a cited copy, and the language refuses to extrapolate.

### Accomplishments

526 automated checks pass, and GitHub Actions runs them on every push before the playground is published (badge in the README):

- 48 on the maths against closed forms, including $100,000 at 5% over 25 years giving $581.60 a month.
- 97 on the language and its error messages.
- 68 on equal horizons, `renews at`, sweeps, the `variable` label, payoff assumptions, and runtime errors that must read the same from both back ends. The horizon and `renews at` figures were also reproduced with a separate Python calculation using decimal cent rounding.
- 307 on compiler and interpreter agreement: 4 examples and 300 random programs that must match byte for byte, plus 3 checks that compiled code needs no `require`, folds posted rates in as cited constants and comments each source line. Every random program uses every statement, including `compare ... over` and `sweep`, every measure, both solvers, posted and typed rates, every compounding choice and payment frequency, `extra`, `lump`, `renews at`, and both rate labels. Error paths are tested separately.
- 6 on the command line.

Agreement between the back ends does not prove the maths, since they share a kernel; that is what the closed form and Python checks are for. The playground had zero axe-core violations under WCAG 2.2 AA and best practice rules at desktop and phone widths on November 19, 2026, America/Toronto, after this round's deploy. That is an automated check, not a full audit. No borrower has used Renew in a recorded session yet; formal user testing is still to come.

### What I learned

Units as types catch the mistakes people actually make with money. A language for a narrow domain can stay small and still be expressive when its nouns are the domain's nouns.

### What's next

Rate paths that change inside a term, for variable mortgages (`rate 5.2% then 4.7% after 12 months`), formal user testing with borrowers, and a language server for editor hover help.

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

Silent walkthrough, 2 minutes 11 seconds, with on screen captions and no voice: https://youtu.be/TGtrxLvYONo (unlisted). The same file is at `docs/demo/renew-walkthrough.mp4` in the repository.

## Image gallery

1. `docs/screenshots/01-playground.png`: the 2026 renewal example
2. `docs/screenshots/02-budget.png`: solving backwards from a budget, with a failing check
3. `docs/screenshots/03-error.png`: a unit error with caret and hint
4. `docs/screenshots/04-compiled.png`: compiled JavaScript
5. `docs/screenshots/05-mobile.png`: phone layout
6. `docs/screenshots/06-horizon-sweep.png`: the equal horizon comparison with its notes, and the offered rate next to the posted benchmark
7. `docs/screenshots/07-sweep-type-error.png`: a sweep with a missing percent sign, refused with a caret and a hint

## Prize categories to tick, if the form offers them

Most Innovative DSL, Best Interpreter, Best Compiler, Best Technical Implementation, Best User Experience, Future of Programming Award.
