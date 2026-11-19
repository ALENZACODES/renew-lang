# Devpost submission draft · Renew · Syntax Summit

Draft only. Not submitted and no Devpost project page has been created.

## Project name

Renew

## Elevator pitch (200 characters max)

Renew is a small typed language for Canadian mortgage renewals. Write the choices as a program, see every formula, and compile it to JavaScript. Real Bank of Canada rates built in.

## Thumbnail (3:2)

`docs/screenshots/thumbnail-3x2.png`

## About the project

### Inspiration

When a mortgage term ends in Canada, the borrower gets a few weeks to choose. Renew for five years at today's rate? Take a shorter term and decide again later? Stretch the amortization to keep the old payment? Each choice is a small calculation, and people do them in spreadsheets they cannot audit or in calculators that hide the maths and answer one case at a time. A renewal decision already has the shape of a program: some facts, a few alternatives, and checks like "the payment must stay under my budget". So I wrote the language for it.

### What it does

Renew programs read like the conversation at renewal time:

```
mortgage "Renewal"
  balance $441,063
  rate posted 5 year on 2026-11-18 fixed
  amortization 20 years
  term 5 years

scenario "One year, then decide" from "Renewal"
  rate posted 1 year on 2026-11-18
  term 1 year

compare all by payment, interest, balance, payoff
explain "Renewal"
check payment of "One year, then decide" <= $3,100
show rate needed for "Renewal" at $3,000
```

- **Typed units.** Money, percentages, lengths of time, numbers and dates are types. `rate 5` is refused with "Add a percent sign, like 5%." and `$5 * $5` is refused before anything runs. `$400,000 * 1%` is `$4,000.00`.
- **Scenarios as differences.** A scenario copies a mortgage and changes only what it states, so each comparison isolates one decision.
- **Real rates.** `posted 5 year on DATE` reads a bundled copy of the Bank of Canada weekly series for a conventional mortgage offered by chartered banks (1, 3 and 5 year terms, January 2016 to November 18, 2026). Dates outside the data are errors. Renew never guesses a rate.
- **Show the work.** `explain` prints each formula with the real numbers substituted.
- **Solve backwards.** `rate needed for` and `amortization needed for` find the input that fits a budget.
- **Checks.** `check` turns a rule of thumb into a pass or fail line.
- **Two back ends.** A tree walking interpreter, and a compiler that emits standalone JavaScript.
- **Playground.** Edit in the browser with highlighting, live results, errors with a caret and a "go to line" button, tabs for the compiled JavaScript and the syntax tree, and share links that carry the whole program.

### How I built it

Plain JavaScript with no dependencies. The pipeline is lexer, recursive descent parser, checker, then either the interpreter or the compiler.

- The **lexer** is line based and understands money, percentages, dates, thousands separators and indentation.
- The **parser** handles precedence for comparison, addition, multiplication and unary minus, and attaches indented settings to the open block.
- The **checker** resolves names in order, applies the unit rules, makes sure every plan has its required settings, folds posted rate lookups to the cited value and week, and records a type on every expression.
- The **interpreter** walks the checked tree and works out plans lazily.
- The **compiler** lowers the same checked tree to JavaScript: typed operations become plain arithmetic, money comparisons round to the cent, posted rates become constants with a comment naming the series and week, and each statement carries a comment with its source line. The output embeds the maths kernel and runs with `node plan.js` with no imports.

The maths is the standard blended payment with the rate converted per payment, `i = (1 + r / c) ^ (c / p) - 1`, compounding half yearly by default because the Interest Act, s. 6, requires mortgage rates to be stated "calculated yearly or half-yearly, not in advance". The schedule rounds interest to the cent each period and lets the last payment absorb the rounding.

### Challenges

Making errors useful. Every error has a line, a column, a caret under the problem and a hint, and unknown words get a "did you mean" from edit distance. Making two back ends agree: the compiler and interpreter share one maths kernel and are tested against each other on every example and 300 random programs, byte for byte. Keeping data honest: the posted rate table is a cited copy, and the language refuses to extrapolate.

### Accomplishments

458 automated checks pass: 48 on the maths against closed forms (including $100,000 at 5% over 25 years giving $581.60 a month), 97 on the language and its error messages, 307 on compiler and interpreter agreement, and 6 on the command line. The playground has zero axe-core violations under WCAG 2.2 AA rules at desktop and phone widths, and works from the keyboard.

### What I learned

Units as types catch the mistakes people actually make with money. A language for a narrow domain can stay small and still be expressive when its nouns are the domain's nouns.

### What's next

Rate paths for variable mortgages (`rate 5.2% then 4.7% after 12 months`), a sweep statement for sensitivity tables, and a language server for editor hover help.

### Team

Solo project by John Khan, Toronto, Ontario. No third party code ships in the language or the playground. Playwright and axe-core were used as test tools only.

## Built with

javascript, node.js, html, css, github-pages, github-actions, bank-of-canada-valet-api, playwright, axe-core

## Try it out links

- Playground: https://alenzacodes.github.io/renew-lang/playground/
- Repository: https://github.com/ALENZACODES/renew-lang
- Language reference: https://github.com/ALENZACODES/renew-lang/blob/main/docs/LANGUAGE.md
- Design notes: https://github.com/ALENZACODES/renew-lang/blob/main/docs/DESIGN.md

## Video demo link (up to 5 minutes)

Silent walkthrough, 2 minutes 11 seconds, with on screen captions and no voice: `docs/demo/renew-walkthrough.mp4` in the repository.
Devpost needs a YouTube, Vimeo or Facebook link here. Upload it unlisted first, then paste the link. Not uploaded yet.

## Image gallery

1. `docs/screenshots/01-playground.png` · the 2026 renewal example
2. `docs/screenshots/02-budget.png` · solving backwards from a budget, with a failing check
3. `docs/screenshots/03-error.png` · a unit error with caret and hint
4. `docs/screenshots/04-compiled.png` · compiled JavaScript
5. `docs/screenshots/05-mobile.png` · phone layout

## Prize categories to tick, if the form offers them

Most Innovative DSL, Best Interpreter, Best Compiler, Best Technical Implementation, Best User Experience, Future of Programming Award.
