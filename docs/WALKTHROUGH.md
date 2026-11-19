# Self walkthrough of the playground

This is a structured walkthrough I did myself, as the author, on 19 November 2026, America/Toronto. It is a heuristic review, not user testing. No borrower or outside participant took part, and nothing here should be read as evidence of how real users behave. Formal user testing is still to come.

## Method

I ran the published playground in Chromium at 1280 by 1000 and at 390 by 844, using a scripted browser and screenshots, and worked through five tasks a borrower or developer would try first. At each step I noted anything that broke one of Jakob Nielsen's ten usability heuristics (for example visibility of system status, error prevention, helping users recognise and recover from errors, and recognition rather than recall). Each problem got a severity from 1 (cosmetic) to 3 (could lead to a wrong decision).

Tasks:

1. Open the playground and read the 2026 renewal result.
2. Change the discount from 1.5% to 1.2% and see the result update.
3. Make a typical unit mistake: write the discount without a percent sign.
4. Open the compiled JavaScript tab.
5. Read the same result on a phone sized screen.

## What it found and what changed

| # | Task | Problem | Heuristic | Severity | Change |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | At desktop width the comparison table was cut off beside the editor. Paid, balance and payoff were only visible after scrolling inside the table. | Visibility of system status | 3 | The output pane is wider than the editor, table headings wrap, and cells can wrap. `browser_check.py` now fails if the first table is cut off at desktop width. |
| 2 | 1 | Comment lines in the examples ran past the visible width of the editor, so the explanation of the example was cut mid sentence. | Recognition rather than recall | 2 | Example comments are wrapped to 46 characters. |
| 3 | 3 | `let discount = 1.5` with no percent sign produced "Cannot use - between a percentage and a plain number" at line 35, where the discount was first used, three lines below the real mistake on line 32, with no hint. | Help users recognise and recover from errors | 2 | The error now says "discount is a plain number (line N). If it is a rate, write it with a percent sign there, like discount = 1.5%." A bare number next to a rate gets "Add a percent sign". Both are tested. |
| 4 | 1 | While rebuilding the example, a scenario that started from another scenario was refused with "There is no mortgage named "Offered 5 year" above this line. Did you mean "Offered 5 year"?", which suggests the very name that was typed. | Help users recognise and recover from errors | 2 | The error now says the name is a scenario, that a scenario starts from a mortgage, and which mortgage to start from. Tested. |
| 5 | 2 | Changing the discount updated every figure and the "1.2 percentage points" line straight away. No problem found. | Visibility of system status | none | None. |
| 6 | 4 | The compiled tab showed the whole program with the kernel at the top, which pushes the program's own lines a long way down. | Aesthetic and minimalist design | 1 | Not changed. The kernel is what makes the output self contained. Each statement is still marked with a `// line N` comment. |
| 7 | 5 | On a phone the comparison table scrolls sideways inside its own box. The page itself does not scroll sideways, and the box can be reached with the keyboard. | Flexibility and efficiency of use | 1 | Not changed yet. A stacked card layout for narrow screens is on the list. |
| 8 | 1 | Long `compare` and `sweep` lines in the editor need sideways scrolling, because Renew has no line continuation. | Aesthetic and minimalist design | 1 | Not changed yet. A continuation rule for long lists of plans is on the list. |

## What this does not show

A self walkthrough finds the problems the author can see. It does not show whether a borrower understands posted against offered rates, the renewal assumption, or the difference between the payment in a term and after it. Those are the first questions for the user testing that is still to come.
