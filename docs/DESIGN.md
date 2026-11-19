# Design notes

## Why a language

A renewal decision is a small program that people already run by hand. Take the balance left at renewal, try three or four rates and terms, ask what each costs, and check each against a budget. Spreadsheets hide that logic in cells. Online calculators answer one case at a time and do not show their maths. Renew makes the decision a short text file that can be read top to bottom, changed in one place, shared as a link and run again when rates move.

## Principles

1. **Read like the conversation.** `scenario "One year, then decide" from "Renewal"` then `term 1 year`. Settings are words people use at renewal time.
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

- **Lexer.** Line based. Recognises money, percentages, dates, numbers with thousands separators, quoted names, words and operators. It records whether each line is indented.
- **Parser.** Recursive descent with operator precedence: comparison, then plus and minus, then times and divide, then unary minus. Indented lines attach to the open block.
- **Checker.** Resolves plan names and `let` names in order, applies the type rules, folds `posted` lookups to the cited rate and its week, makes sure every plan has its required settings, and annotates each expression with its type.
- **Interpreter.** Walks the checked tree. Plans are worked out lazily and cached, so a plan that is never measured is never computed.
- **Compiler.** Lowers the same checked tree to JavaScript. Typed operations become plain arithmetic (a percentage of money gets its `* 0.01`), money comparisons are rounded to the cent, `posted` lookups become constants with a comment naming the series and week, and each statement carries a comment with its source line. The output embeds the math kernel, needs no imports, and runs with `node plan.js` or in a browser.
- **Kernel.** `src/kernel.js` holds the maths and the report formatter. The interpreter calls it directly. The compiler copies its source into every compiled program, so both paths share one implementation of the maths and differ only in how the program around it is evaluated.

## How the two back ends are kept honest

`tests/test_compiler.mjs` runs every example and 300 random programs both ways, from a fixed seed, and requires the reports to match byte for byte. Compiled programs run in a sandbox with `require` disabled to prove they are self contained.

## Out of scope on purpose

Renew does not give advice, quote lender rates, qualify anyone for a loan or estimate prepayment charges set by a contract. It models the payment maths and the choices a borrower writes down.

## What is next

- Rate paths for variable mortgages, for example `rate 5.2% then 4.7% after 12 months`.
- A `table` statement that sweeps one setting across a range.
- A language server for editor highlighting and hover help.
