# Using a compiled Renew program in your own code

`renew compile plan.renew --module > plan.mjs` turns a program into one ES module with no other files and no network calls. `examples/embed/renewal-2026.mjs` is the 2026 example compiled this way. Renew is not published to npm; copy the module into your project.

## The smallest page

[examples/minimal.html](../examples/minimal.html) ([live](https://alenzacodes.github.io/renew-lang/examples/minimal.html)) is the whole integration in one file:

```html
<input id="discount" value="1.5%" aria-label="Discount off the posted rate" />
<p id="out" role="status"></p>
<script type="module">
  import { run } from "./embed/renewal-2026.mjs";
  const out = document.getElementById("out");
  try {
    const { blocks } = run({ discount: document.getElementById("discount").value });
    const be = blocks.find((b) => b.kind === "value" && b.text.startsWith("break even"));
    out.textContent = be.value === null ? be.text : "Break even renewal rate: " + be.value + "%";
  } catch (err) {
    out.textContent = err.message;
  }
</script>
```

A module script must be served over http or https; a page opened from a file on disk will not load it. `python3 -m http.server` in the repo folder is enough to try it.

## The contract

The module exports two names.

- `inputs` is an object with one entry per `input` line: `{ discount: { type: "percent", default: "1.5%", line: 14 } }`. `type` is `money`, `percent`, `duration` or `number`.
- `run(inputs)` runs the program and returns `{ blocks, report }`. `report` is the same text as `renew run`. `blocks` has one entry per result, in program order, with the same shape as `renew run --json`:
  - a `value` block (`show`): `value`, `type` (`money`, `percent`, `points`, `duration` in months, `number`, `date` or `bool`), `text` and `notes`. A break even with no single answer has `value` null.
  - a `table` block (`compare`, `sweep`, `schedule`, `yearly`): `title`, `columns`, `rows` as printed, `raw` numbers, `units` and `notes`. Use `raw` for charts and further maths.
  - an `explain` block: `title` and `lines`. A `check` block: `pass`, `text` and the source `line`.

`run()` with no argument uses every default. Each call starts fresh, so it is safe to call again on every keystroke.

## Input values

Pass every input as text with its unit, the way it is written in a program: `"1.5%"`, `"$3,000"`, `"20 years"`. A bare JavaScript number is refused for a money, percent or duration input, because `1` does not say whether it means 1% or $1. Only a `number` input takes a plain number.

## Errors

Every error is a plain `Error` thrown from `run()`, with a message written for the person reading the page. Show `err.message` as it is. Three kinds can reach you:

- an input with the wrong unit or form: `Input discount must be a percentage, written with its unit, like "1.5%". Got "abc".`
- an input name the program does not have: `This program has no input named "nope".`
- an input that makes the program impossible: with `discount` at `-50%`, `Line 46: no amortization up to 50 years brings the payment to $2,848.54 or less.` The line number points at the program, not at your page.

Mistakes in the program itself (a unit error, a misspelt name, a bare `variable`) are caught when it is compiled, so a module that exists has already passed the checker.

## Where the numbers come from

- Posted rates are the Bank of Canada weekly series V80691333, V80691334 and V80691335 (1, 3 and 5 year conventional mortgage, chartered banks), retrieved November 19, 2026. Only the rates the program uses are copied into the module, each with a comment naming its series and week. They are posted benchmarks, not offers.
- Every other number is typed in the program or passed as an input.
- The maths is blended payments with the rate compounded as stated, half yearly unless the program says otherwise. docs/LANGUAGE.md gives the formulas, and tests/verify/independent.py checks them in a separate Python calculation.

## What it does not cover

- It works out arithmetic, not contract terms: maximum amortizations, what a lender does near the trigger rate, and prepayment limits are not modelled. See "Scenarios, not contract terms" in docs/LANGUAGE.md.
- `amortization needed`, `amortization to fit` and `break even amortization` search up to 50 years. A payoff still owing after 1,000 years is reported as not repaid within that limit.
- `break even` searches a fixed range for each setting, from 0% to 30% for rates and up to $10,000,000 for `balance` and `lump`; the table under Break even in docs/LANGUAGE.md gives every range. The note under each result says how the range was searched.
- Posted rates: A date up to six days after the last week in the bundled copy reads that last week; a date later than that is an error. In this copy the last week is November 18, 2026, so dates from November 19 to November 24, 2026 read the November 18 week, and November 25, 2026 or later is an error. Run `npm run rates` and compile again to update.
- The module is plain JavaScript for modern browsers and Node 18 or newer. It has no dependencies and does not change the page; drawing is up to you.
