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
2. In example 04, change `rate 5%` to `rate 5`: the error has a caret and "Add a percent sign, like 5%."
3. Example 07: two break even changes 29 cents apart, both found; the money search covers every cent if the bound in docs/LANGUAGE.md holds.
4. Example 06: the trigger is 6.53% at the start but 6.607% after 6 months, so a move to 6.60% runs, with a 106 year payoff labelled as a projection, not a contract term.
5. [examples/minimal.html](https://alenzacodes.github.io/renew-lang/examples/minimal.html): a compiled program in a page in about 20 lines of script; [docs/INTEGRATION.md](https://github.com/ALENZACODES/renew-lang/blob/main/docs/INTEGRATION.md) gives the contract.

### Inspiration

When a Canadian mortgage term ends, the borrower has a few weeks to compare a handful of choices, usually one calculator case at a time. That decision already has the shape of a program: facts, alternatives and checks. Renew is for borrowers comfortable editing a short text file and for developers who want renewal maths they can read and test.

### What it does

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

compare all by payment, interest, paid, balance, payoff
    over 5 years
show break even renews at "Offered 1 year, then decide" vs "Offered 5 year"
    by interest over 5 years
explain "Offered 5 year"
```

"Offered" means the Bank of Canada posted rate minus the discount input, not a lender's quote. The break even, 4.889%, is the first renewal rate on a 0.001 point grid at which the 1 year offer stops costing less interest; its note gives the figures either side.

- **Typed units and fair comparisons.** `rate 5` and `$5 * $5` are refused before anything runs; `over 5 years` follows every plan for the same months.
- **Rates that change.** Rate paths, renewal paths and `payment held` with its trigger rate; a plan marked `variable` needs a rate that changes.
- **Break even on any setting.** Every rate and month is worked out. For money, a search skips only stretches its bound rules out; the bound has a written derivation, each step tested, not a machine checked proof.
- **Posted rates.** A date up to six days after the last week in the bundled copy reads that last week; a date later than that is an error. In this copy the last week is November 18, 2026, so dates from November 19 to November 24, 2026 read the November 18 week, and November 25, 2026 or later is an error.

### Renew next to a spreadsheet

A careful spreadsheet can do every calculation Renew does. Renew makes the safeguards the default: a rate typed as 5 is refused, a second option is one `scenario` plus the line that changes, `break even` is one line where Goal Seek is one cell at a time, and a change is a readable diff. A spreadsheet is better for charts and free form what ifs.

### How I built it

Plain JavaScript with no dependencies: a lexer, a recursive descent parser, a checker for names and units, then a tree walking interpreter or a compiler to standalone JavaScript with posted rates folded in as cited constants. Both share one maths kernel; docs/LANGUAGE.md has the formulas and the search bound.

### Accomplishments

1,502 automated checks pass on every push before the playground is published. The interpreter and compiler agree byte for byte on 7 examples and 300 random programs. A separate Python calculation matches 13 cases to the cent and found one real rounding difference, now fixed. The browser check reports zero axe-core violations in 36 page states (automated, not a full audit). No borrower has used Renew in a recorded session yet; docs/WALKTHROUGH.md is a self review, not user testing. Details: [docs/TESTS.md](https://github.com/ALENZACODES/renew-lang/blob/main/docs/TESTS.md) and [CHANGELOG.md](https://github.com/ALENZACODES/renew-lang/blob/main/CHANGELOG.md).

### What I learned

Units as types catch real money mistakes, and a separate calculation is worth writing even when two back ends agree.

### What's next

Contract terms as optional settings, formal user testing with borrowers, and editor hover help.

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

The video is kept as it was recorded, at commit 40986a4, with 458 checks. Everything since is listed version by version in [CHANGELOG.md](https://github.com/ALENZACODES/renew-lang/blob/main/CHANGELOG.md). The current build is v1.10.0, with 1,502 checks. Its changes are in the language rules, the docs and the tests, not in what the examples show: every bundled example and every screenshot program gives byte identical output in v1.9.0 and v1.10.0. So the gallery GIF and screenshots 09 and 19, captured from v1.9.0, show the current screens, and screenshots 11, 13, 16, 17 and 18, captured from v1.8.0, show screens that are the same in v1.9.0. The video itself is unchanged.

### What the video shows, and what it does not

The video shows, at commit 40986a4: `mortgage` and `scenario` blocks and the report; a `check`; adding a three year option; a unit error with its caret and hint, then the fix; solving from a budget with `rate needed for` and `amortization needed for`; accelerated biweekly payments, extra payments and a lump sum; the compiled JavaScript; the language summary; and a closing card that says 458 checks, the count at that commit.

The video predates, and so does not show: `compare ... over` equal horizons; `renews at`; sweeps and `against`; the "Payment after term" column and `renewal payment`; the variable rate warnings; the note on posted rates next to typed ones; percentage points; `paid`; rate paths inside the term; multi step renewal paths; `payment held` and the trigger rate; `break even` on any setting; `amortization to fit` and `amortization remaining from`; continued lines; `input` and its playground boxes; `compile --module`, `--input` and `--json`; the embed page; `npm run rates`; stacked cards on phones; and everything new in v1.7.0 to v1.10.0, listed in CHANGELOG.md. The test count is now 1,502. Gallery image 1 is a 38.5 second silent GIF of v1.9.0, made by automated browser capture, whose screens are the same in v1.10.0. It is a gallery image, not a new video. Gallery image 2 puts the video build and the current build side by side on the same input. The README and the live playground show the current version, v1.10.0.

## Image gallery

1. `docs/screenshots/15-current-build.gif`: a 38.5 second silent capture of v1.9.0 (its screens are the same in v1.10.0), made by automated browser capture on November 20, 2026: the "Scenarios, not contract terms" box first on the page; the 2026 example with the discount input at 1.5% and a break even of 4.889%, with the note that every rate from 0% to 30% was worked out; typing 1% in the input box, without editing the program, moves it to 5.388%; the payment held example, trigger 6.53% at the start; example 06's explain line, where the trigger on the balance after 6 months is 6.607%, so 6.60% runs; its 106 years 1 month payoff, a mathematical projection, not a contract term; example 07's two break even changes 29 cents apart, with the note that every cent is covered if the stated bound holds; the compiled JavaScript; and examples/minimal.html.
2. `docs/screenshots/00-before-after.png`: before and after, the same two plan comparison at phone width in the video build (commit 40986a4) and now (also the thumbnail)
3. `docs/screenshots/19-two-crossings.png`: example 07, two break even changes 29 cents apart, with the note that every cent is covered if the bound in docs/LANGUAGE.md holds
4. `docs/screenshots/16-trigger-boundary-payoff.png`: example 06's explain line, where the trigger on the balance after 6 months is 6.607%, so 6.60% runs and the payoff is 106 years 1 month, a mathematical projection, not a contract term
5. `docs/screenshots/13-payment-held.png`: an adjustable payment against `payment held` on the same rate path, with the time to pay off and the trigger rate
6. `docs/screenshots/11-break-even-input.png`: the discount input set to 1% and the break even, 5.388%, with its grid note
7. `docs/screenshots/18-limits-box.png`: the "Scenarios, not contract terms" box, first on the playground page
8. `docs/screenshots/14-embed.png`: `examples/embed.html`, a page drawn from the compiled module's raw numbers
9. `docs/screenshots/10-rate-paths.png`: a rate path inside the term and a two step renewal path, with each change explained
10. `docs/screenshots/05-mobile.png`: phone layout, one card per plan
11. `docs/screenshots/01-playground.png`: the 2026 renewal example
12. `docs/screenshots/06-horizon-sweep.png`: the 2026 example's forward comparison over 5 years, with its notes
13. `docs/screenshots/08-sweep-against.png`: the renews sweep with the payment after term, against the 5 year offer
14. `docs/screenshots/09-variable-warning.png`: a plan marked variable, with the warning under its table and its value
15. `docs/screenshots/02-budget.png`: solving backwards from a budget, with a failing check
16. `docs/screenshots/03-error.png`: a unit error with caret and hint
17. `docs/screenshots/04-compiled.png`: compiled JavaScript
18. `docs/screenshots/07-sweep-type-error.png`: a sweep with a missing percent sign, refused with a caret and a hint
19. `docs/screenshots/17-break-even-guarantee.png`: the break even note, which says every rate on the grid from 0% to 30% was worked out

## Prize categories to tick, if the form offers them

Most Innovative DSL, Best Interpreter, Best Compiler, Best Technical Implementation, Best User Experience, Future of Programming Award.
