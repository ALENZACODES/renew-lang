# Changelog

Every version since the first commit, a68815d, on November 19, 2026. The video (https://youtu.be/TGtrxLvYONo) was recorded at commit 40986a4 and has not been re-recorded, so everything below that line is newer than the video.

## v1.10.0

- One rule for `variable`, stated in one place in docs/LANGUAGE.md: a plan marked `variable` needs a rate that changes. Its rate must move away from its starting rate through a rate path, `renews at` (its own or inherited), or a sweep of its `rate` or `renews`. When the later rates are known before the program runs (typed rates, `let` values, posted rates), a plan whose later rates all equal its start is refused at the word, with one message: `"Same" is marked variable, but its rate never moves: every later rate is 5.2%, the same as its starting rate.` When a later rate comes from an input, nothing fails when the program runs; the result carries a note that with these inputs it works out as a fixed rate. Before this, that case threw an error at run time.
- Sweeps and break evens keep holding an amortization from `amortization to fit`, now with the reason written down in docs/LANGUAGE.md: every row stays one setting away from the plan, so each row can be checked with one `compare`. For a money break even it is also what lets the bound apply. A rate sweep beside `amortization to fit` is tested row by row against the plan with the amortization written out.
- The bound behind the certified money search is written out as a five step derivation in docs/LANGUAGE.md, and each step is tested on its own on an exact copy of the kernel (900 random plans, seed 20261124). It is a derivation checked by tests, not a machine checked proof.
- The compiler tests check the 7 examples on their result blocks as well as their report, so `test_compiler.mjs` has 617 checks (7 examples and 300 random programs, 2 checks each, plus 3).
- docs/TESTS.md says some balances stop under the old payment rule, not every balance.
- The recommended spelling for a renewal break even is `break even renews at "A" vs "B"`.
- The Devpost draft About section is shorter; the version history moved here.
- 1,508 checks.

## v1.9.0 (f0d04aa)

- Every payment is at least a cent above its interest, so a balance of a few dollars no longer stops the certified money search, and the fallback note names its reason.
- An amortization from `amortization to fit` is held fixed while a sweep or a break even changes another setting, with a note.
- `variable` is refused when its `renews at` or path equals the starting rate.
- One label per rate line; `renews at` accepted in `sweep` and `break even`.
- Every sentence that says every cent is covered also says it depends on the bound.
- One posted rate cutoff sentence in the README and the draft; boundary and window tests for the search.
- 1,478 checks.

## v1.8.0 (a4b0b14, then 8dc8bfe)

- The money search bound `K` and `R` written out with its argument and its two fallback cases, and each half of the bound checked on its own.
- `variable` needs a real rate change: `payment held` or a sweep of another setting does not count.
- One posted rate cutoff in the code and every doc.
- Example 06's later trigger explained, on the starting balance and on the balance after 6 months.

## v1.7.0 (6ad3899)

- Certified money break even, the short `vs` form, `variable` needs a rate change, the "Scenarios, not contract terms" box, docs/INTEGRATION.md, examples/minimal.html and example 07.

## v1.6.0 (2895590)

- Break even works out every rate and every month; the real payoff past 100 years with a 1,000 year limit; syntax references; what changed since the video.

## Before v1.6.0

- 8f60efc: `payment fixed` renamed `payment held`, several break even crossings detected, the language pipeline split into files, a local editor grammar.
- ec9594f: docs, playground reference, screenshots and a silent GIF of the build.
- 4df0680: `payment fixed` for variable rates, break even on any setting, one input rule, `run --json` and an embed example.
- 640be92: walkthrough findings marked as fixed.
- 157e65a: rate paths inside the term, multi step renewals, break even, `amortization to fit` and `remaining from`, line continuation, inputs and `compile --module`, `npm run rates`, stacked cards on phones, the before and after image.
- 15575fa: payment after term in renews sweeps, sweep against a plan, fair comparison notes, variable rate warnings, percentage points, `paid`, the rebuilt 2026 example, clearer errors, the self walkthrough.
- 48f00a6: equal horizon comparisons, `renews at`, sweep, the offered rate example, Interest Act wording fixes and a CI badge.
- 126b79d: screenshots refreshed.
- 40986a4: the silent walkthrough video, screenshots and the submission draft. The video was recorded here, with 458 checks.
- a68815d: the language, with interpreter, compiler, playground and tests.
