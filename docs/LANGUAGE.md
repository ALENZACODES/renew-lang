# Renew language reference

Renew programs are plain text files ending in `.renew`. A program is a list of lines. A line that starts at the left edge is a statement. A line that starts with spaces is a setting that belongs to the `mortgage` or `scenario` above it. `#` starts a comment.

A long line can carry on. If a line ends with a comma, the next line is part of it. An indented line that starts with `by`, `over`, `against` or `then` is also part of the line above. Errors on a carried on line still point at that line and column. Keywords are not case sensitive. Names in quotes are.

## Scenarios, not contract terms

Renew works out what the arithmetic of a mortgage gives. It does not know the terms of any real contract, and some figures it can produce are mathematical scenarios that a contract may not permit:

- **Long amortizations.** `amortization needed for`, `amortization to fit` and `break even amortization` search up to 50 years. Lenders and mortgage insurance rules set their own maximum amortization, which is often well under 50 years.
- **A held payment past its amortization.** With `payment held`, the time to pay off can run far past the amortization, as in the 106 years 1 month of `examples/06-trigger-boundary.renew`. That is how long the payment would take if the rate stayed there: a mathematical projection, not a contract term. Contracts set their own rules near the trigger rate.
- **The trigger rate.** `trigger rate of "Plan"` is the rate at which the payment only covers the interest. When a real lender acts, and what it does, is set by the contract, and Renew does not model it.
- **Extra and lump payments.** Contracts limit how much you can prepay each year without a charge. Renew does not check those limits.

Read the contract or ask the lender before acting on any of these figures.

## Grammar

```ebnf
program     = { line } ;
line        = statement | setting | comment | blank ;

statement   = mortgage | scenario | let | input | compare | sweep | show | explain | check ;
mortgage    = "mortgage" NAME ;
scenario    = "scenario" NAME [ "from" NAME ] ;
let         = "let" IDENT "=" expr ;
input       = "input" IDENT "=" expr ;          (* money, percentage, length of time or number *)
compare     = "compare" [ "all" | NAME { "," NAME } ] [ "by" measures ] [ "over" sum ] ;
sweep       = "sweep" NAME swept "from" sum "to" sum "step" sum [ "by" measures ] [ "over" sum ] [ "against" NAME ] ;
swept       = "rate" | "balance" | "amortization" | "term" | "extra" | "lump" | "renews" [ "at" ] ;
measures    = measure { "," measure } ;
show        = "show" ( ( "schedule" | "yearly" ) NAME [ "first" INTEGER ] | expr ) ;
explain     = "explain" NAME ;
check       = "check" expr ;                     (* must be a comparison *)

setting     = INDENT ( "balance" expr
                     | "rate" expr ( label { path } | { path } [ label ] ) [ "payment" "held" ]
                     | "compounded" ( "semi-annually" | "monthly" | "annually" )
                     | "amortization" ( expr
                                    | "to" "fit" expr
                                    | "remaining" "from" NAME )
                     | "payments" frequency
                     | "term" expr
                     | "extra" expr "per" "payment"
                     | "lump" expr "every" "year"
                     | "renews" "at" expr { path } ) ;
path        = "then" sum "after" sum ;          (* a percentage, then a length of time *)
label       = "fixed" | "variable" ;            (* at most one per rate line, before or after the path *)
frequency   = "monthly" | "semi-monthly" | "biweekly" | "weekly"
            | "accelerated" ( "biweekly" | "weekly" ) ;

expr        = sum [ ( "<" | ">" | "<=" | ">=" | "==" | "!=" ) sum ] ;
sum         = product { ( "+" | "-" ) product } ;
product     = unary { ( "*" | "/" ) unary } ;
unary       = "-" unary | primary ;
primary     = MONEY | PERCENT | DATE | NUMBER [ duration ] | "yes" | "no"
            | IDENT | "(" expr ")"
            | measure "of" NAME
            | ( "rate" | "amortization" ) "needed" "for" NAME "at" sum
            | "break" "even" swept [ "for" ] NAME ( "against" | "vs" ) NAME "by" ( "interest" | "paid" ) "over" sum
            | "posted" ( "1" | "3" | "5" ) "year" "on" DATE
            | ( "min" | "max" ) "(" expr "," expr ")" ;
duration    = ( "year" | "years" ) [ NUMBER ( "month" | "months" ) ] | "month" | "months" ;
measure     = "payment" | "renewal" "payment" | "yearly" | "interest" | "principal" | "balance"
            | "paid" | "rate" | "payoff" | "three" "months" "interest" | "trigger" "rate" ;

MONEY   = "$" NUMBER ;        (* $412,500 or $2,600.50 *)
PERCENT = NUMBER "%" ;        (* 5% or 4.79% *)
NUMBER  = ( digit { digit } | digit [ digit ] [ digit ] "," 3digits { "," 3digits } ) [ "." digit { digit } ] ;
                              (* 25, 2600.50, 412,500; commas must group thousands *)
3digits = digit digit digit ;
DATE    = YYYY "-" MM "-" DD ;
NAME    = '"' { any character except '"' } '"' ;
```

## Types

Every value has one of six types, and the checker rejects a program before it runs if types do not fit.

| Type | Written as | Example |
| --- | --- | --- |
| money | `$` and an amount | `$412,500` |
| percentage | a number and `%` | `4.79%` |
| length of time | years and months | `20 years 6 months` |
| plain number | a number | `1.1` |
| date | `YYYY-MM-DD` | `2026-11-18` |
| yes or no | a comparison, `yes`, `no` | `payment of "A" <= $3,000` |

Arithmetic that makes sense is allowed and keeps its unit: money plus money, money times a number, money divided by money gives a number, a percentage of money is money (`$400,000 * 1%` is `$4,000.00`), and lengths of time add. Anything else is an error that names both types, for example `Cannot use * between an amount of money and an amount of money`. Comparisons need both sides to be the same type. Money is compared to the cent.

Settings are typed too. `rate 5` is refused with the hint `Add a percent sign, like 5%.`

A percentage minus a percentage is still a percentage to the checker, so it can be compared with other rates, but `show` prints it in percentage points: `show rate of "Renewal" - rate of "Offered 5 year"` prints `1.5 percentage points`. A gap between 6.19% and 4.69% is 1.5 points, not 1.5% of anything.

## Plans

A `mortgage` needs `balance`, `rate`, `amortization` and `term`. `compounded` defaults to `semi-annually` and `payments` defaults to `monthly`.

Plan names are always quoted strings, in every place they appear: `mortgage "Renewal"`, `payment of "Renewal"`, `compare "Renewal", "Offered"`. Value names made with `let` are bare words.

`rate 4.69%` is how you type a rate you were offered. `rate posted 5 year on 2026-11-18` reads the posted benchmark. Both can sit side by side, for example `let offered = 4.69%` and then `show rate of "Renewal" - offered`.

A rate line takes one label at most, written before the rate path or after it. `rate 5% variable then 4% after 12 months fixed` is refused at the second label.

Without a rate path, `fixed` or `variable` after a rate is a label: Renew works out the plan as if the rate you write holds for the whole term, and a plan marked `variable` gets a warning under its results that a real variable rate can change at any time. A plan marked `variable` needs a rate that changes, so that the warning has something to say. The rule is one sentence: somewhere in the program its rate must move away from its starting rate, through a rate path, `renews at` (its own or from the plan it copies), or a `sweep` of its `rate` or `renews`. Anything else is refused at the word `variable` (or at `payment`, when `payment held` is what marked the plan variable), with one message, for example `"Same" is marked variable, but its rate never moves: every later rate is 5.2%, the same as its starting rate.` The hint offers a different later rate, a sweep, or leaving the word out. This is checked before anything runs whenever the rates are known then: typed rates, `let` values and posted rates. When a later rate comes from an `input`, Renew cannot know it in advance, so nothing fails when the program runs; if the input makes every later rate equal to the starting rate, the result carries the note `Variable rate: with these inputs every later rate for "In" is 5.2%, the same as its starting rate, so it works out as a fixed rate.`, from the interpreter and from compiled code alike. Every result that involves a plan marked `variable` carries a warning: a note under any `compare` or `sweep` table it appears in, a note under any `show` value that uses it, and a line in `explain`. The playground shows these warnings in a box of their own.

A `rate` written as `posted N year on DATE` and nothing else is a posted benchmark. Any other rate, including `posted 5 year on 2026-11-18 - discount`, is a typed rate. When one table mixes the two, a note says so, because posted rates are usually higher than the rates lenders offer.

The amortization is always counted from the start of the plan it is written in. Two forms work it out for you:

- `amortization remaining from "Signed in 2021"` is that plan's amortization minus its term: 25 years minus 5 years is 20 years. The plan named must be above this line.
- `amortization to fit payment of "Signed in 2021"` is the shortest whole number of months, up to 50 years, whose payment is at or under the amount. It is the same search as `amortization needed for`, done on this plan's own settings. If no amortization up to 50 years fits, it is an error.

A bare `remaining` after a length of time, as in `amortization 20 years remaining`, used to be a word for reading only. It is now refused with a hint, so a word in a program never does nothing.

A `scenario` starts from a copy of a mortgage (the one named after `from`, or the nearest `mortgage` above it) and replaces only the settings written under it. Names are set once. Using a name before it exists is an error, with a suggestion when a close name exists.

`renews at 5.5%` sets the rate after the term ends. At the end of the term the payment is worked out again on the balance left, over the rest of the amortization, the way a renewal resets it. Without `renews at`, the rate after the term is assumed to stay the same. Either way it is an assumption, not a forecast.


## Rate paths

A rate can change inside the term: `rate 5.2% then 4.7% after 12 months`. Each `after` counts from when the rate before it started, so `rate 4.2% then 3.95% after 6 months then 4.45% after 2 years` changes at month 6 and again at month 30. Every change must fall inside the term; a change at or after the end of the term is an error that points to `renews at`.

At each change the payment is worked out again on the balance left, over the rest of the amortization. This is an adjustable payment, and it is the default.

Many variable mortgages instead keep the payment the same and let the time to pay off move. Write `payment held` at the end of the rate line for that: `rate 4.2% then 5.5% after 6 months payment held`. The payment is worked out once at the start and kept at every change inside the term. More of it goes to interest when the rate rises, so the balance falls more slowly and `payoff` gets longer. At renewal (`renews at`) the payment is worked out again over the amortization left, as a renewal does, and stays that way after.

The trigger rate is the rate at which a payment only covers the interest. For a payment `P` on a balance `L`, compounded `c` times a year and paid `p` times a year, it is `c x ((1 + P / L) ^ (p / c) - 1)`, rounded down to a thousandth of a percent. Shown values are rounded down, then trailing zeros are dropped: in `examples/06-trigger-boundary.renew` the trigger on the starting balance is 6.5301% to four decimals (6.530115...%), rounded down to 6.530%, and shown as 6.53%. The shown figure is never above the true one. Renew decides whether a path crosses the trigger by comparing the payment with the interest due in cents, not by comparing rates with the shown figure. `trigger rate of "Plan"` gives it for the plan's first payment on its starting balance; for a plan without `payment held` it is only a reference figure, because that payment is worked out again at every change. `explain` gives the trigger rate again at every change of a `payment held` plan, on the balance at that moment. Renew does not let a balance grow: if a change in the rate path reaches the trigger rate, so the payment no longer covers the interest, it is an error at the plan's line. The error names the rate, the month, the interest now due and the trigger on that balance, and it offers two ways on: a lower rate, or leave out `payment held` so the payment is worked out again. It does not model what a lender might do instead. Among the behaviours it leaves out are raising the payment to at least the interest, converting the loan to a fixed rate, asking for a lump sum, and letting the balance grow up to a cap. `examples/06-trigger-boundary.renew` is a path that stays just under the later trigger (4.2% then 6.60% after 6 months, still covered by a $2,147.67 payment): on the balance left after 6 months, $395,401.68, the trigger is 6.607% (about 6.6071%), and `explain` prints it on the change line. `examples/refused/trigger-crossed.renew` is the same plan at 6.61%, which Renew refuses. The refused file is not in the playground.

Just under the trigger, the payment covers the interest by a few dollars, so the time to pay off can run far past the amortization. At 6.60% in `examples/06-trigger-boundary.renew` it is 106 years 1 month. Renew reports that figure as it is, with a note: it is how long that payment would take if the rate stayed there, a mathematical projection, not a contract term. The calculation stops at 1,000 years. A plan still owing then is reported as not repaid within 1,000 years, the limit of the calculation, not as paid off; `explain` says "more than" that time.

`payment held` needs a variable rate, so `rate 5% fixed payment held` is an error at the word `payment`. The old spelling `payment fixed` is refused with a hint to write `payment held`, so `fixed` keeps one meaning: a rate label. A scenario that sets its own `rate` line starts again without `payment held` unless it writes it. `examples/05-payment-held.renew` compares the two kinds on one path, 4.2% then 5.5% after 6 months: the same $2,147.67 payment at the start, $374,727.46 against $383,994.55 owed after 3 years, 25 years against 33 years 8 months to pay off, and a trigger rate of 6.53% on its $400,000 starting balance. That example uses the default semi-annual compounding. Some lenders compound variable rate mortgages monthly; write `compounded monthly` to follow one of those, and check what your own mortgage says.

A rate with a path is a variable rate. With no label it is marked `variable`; marked `fixed`, it is an error. The note under results says the plan follows the path written in the program, which is one path, not a forecast.

`renews at` takes a path too: `renews at 4.5% then 5% after 1 year` renews at 4.5% at the end of the term and moves to 5% a year later. The first `after` counts from the renewal. The last step must start before the amortization ends. `explain` shows the date of every change, the balance at that moment and the new payment.

## Inputs

`input discount = 1.5%` works like `let`, and it also marks the value as one that can change without editing the program. The value written is the default. The type is fixed by the default: money, a percentage, a length of time or a plain number.

- The playground shows a box for every input above the editor. Changing a box reruns the program; the program text stays the same.
- `renew run plan.renew --input discount=1%` runs with another value.
- A compiled program takes `--discount=1%` on the command line, or `run({ discount: "1%" })` from code.

One rule covers every way in, the playground, the command line, compiled code and the ES module: a value is text written with its unit, the same as in a program. `"1%"` for a percentage, `"$3,000"` for money, `"20 years"` or `"240 months"` for a length of time. A plain number input takes `"12"` or the number `12`. Nothing else accepts a JavaScript number, because a number on its own does not say its unit: is `1` one percent or one hundredth? So `run({ discount: 1 })` and `--input discount=1` are refused with the line of the input and an example of the right form. A value with the wrong unit, like `"$1"` for a percentage, is refused the same way. Naming an input the program does not have is an error with a suggestion.

## Using results from code

`renew run plan.renew --json` prints `{ "blocks": [...] }` instead of the text report, one block per result in program order, the same blocks `run()` returns. Every block has `kind`.

- A `value` block (from `show`) also has `value`, the number itself, and `type`: `money`, `percent`, `points`, `duration` (in months), `number`, `date` (as `YYYY-MM-DD` text) or `bool` (true or false). Money is rounded to the cent. It also has `text`, the printed line, and `notes`. A break even with no answer in its range has `value` null.
- A `table` block (from `compare`, `sweep`, `show schedule` and `show yearly`) has `columns` and `rows` as printed, and `raw` and `units` with the numbers behind them. In a sweep the first column of `raw` is the value swept. It also has `title` and `notes`. Use `raw`, not the printed text, for charts and further maths.
- An `explain` block has `title` and `lines`. A `check` block has `pass`, `text` and the source `line`.

Errors still go to standard error with exit code 1, as text with the line and column. `compile --module` gives the same blocks from `run(inputs)` in an ES module with no other files needed. `examples/embed.html` imports the module made from the 2026 example, `examples/embed/renewal-2026.mjs`, and draws a bar chart and a table from `raw`, with the discount as a box on the page.

## Break even

`break even SETTING for "A" against "B" by interest over 5 years` finds the value of one setting of plan A at which the answer to "does A cost less than B over the horizon?" changes. The short form `break even SETTING "A" vs "B" by interest over 5 years` is the same statement; `for` can be left out and `vs` can stand for `against`. For the renewal rate the setting can be written `renews at`, as in a plan, or `renews` for short. With the short form the clearest spelling is `break even renews at "A" vs "B" by interest over 5 years`; `break even renews "A" vs "B"` and `break even renews for "A" against "B"` say the same thing. The setting is any one a sweep can change, and the answer has its type:

| Setting | Range tried | Grid |
| --- | --- | --- |
| `rate`, `renews` | 0% to 30% | a thousandth of a percentage point |
| `balance` | $1.00 to $10,000,000.00 | one cent |
| `extra` | $0.00 to $50,000.00 | one cent |
| `lump` | $0.00 to $10,000,000.00 | one cent |
| `term` | 1 month to the amortization | one month |
| `amortization` | the term to 50 years | one month |

Renew first scans the range, then halves each stretch where the answer flips, until it finds two neighbouring grid values with different answers. What the scan guarantees depends on the setting:

- For `rate`, `renews`, `term` and `amortization`, every value on the grid is worked out: all 30,001 rates from 0% to 30%, and every month in the range. Every place on the grid where the answer changes is found, however close together two of them are.
- For `balance`, `extra` and `lump`, the range holds up to a billion cents, too many to try one by one. Renew uses a bounded search, called the certified search in the notes. It skips a stretch of amounts only where the bound `K` and `R` below shows the answer cannot change inside it, and splits everything else down to single cents. If the bound holds, every cent of the range where the answer changes is found, and two changes one cent apart are both found. The bound is derived by the written argument below and checked by tests; it is not a machine checked proof. In two exact cases, listed below, the certified search gives way to a sampled search with a weaker guarantee, and the note says so.


### The money search bound

These are the exact formulas in `moneyBound` in `src/kernel.js`.

- `N` is the number of payments in the horizon: the horizon in months divided by 12, times the payments a year, rounded.
- `i` is the highest rate per payment the plan can use: the largest of the starting rate, the `renews at` rate, and every rate in a rate path or a renewal path, each turned into a rate per payment with `i = (1 + r / c) ^ (c / p) - 1`.
- `G = (1 + i) ^ N`, the most one dollar can grow over the horizon.
- `m` is how many times the setting is paid inside the horizon: 1 for `balance`, `N` for `extra`, and `floor(N / p)` for `lump`, paid once a year.
- `K`, the most the answer can move per dollar of the setting, is `1.25 x m x (G - 1)` for `by interest`, and `1.25 x (m x (G - 1) + m x G + b)` for `by paid`, where `b` is 1 for `balance` and 0 otherwise.
- `R`, in dollars, is `1.25 x (0.005 x N + 0.015 x N x G x (1 + i x N)) + 0.000001`.

How they are used. Write `F(x)` for the exact answer at amount `x`, the same plan worked out with nothing rounded to the cent, and `f(x)` for the answer Renew reports, rounded to the cent at every payment. The bound claims two things: (a) `|F(x) - F(y)| <= K x |x - y|`, with `x` and `y` in dollars, and (b) `|f(x) - F(x)| <= R` at every amount. For a stretch from `a` to `b`, (a) gives `F(x) >= max(F(a) - K x (x - a), F(b) - K x (b - x)) >= (F(a) + F(b) - K x (b - a)) / 2`, and (b) turns each `F` into the reported `f` at a cost of `R` at each end and `R` at `x`. So every reported value inside the stretch is within `(f(a) + f(b)) / 2` plus or minus `K x (b - a) / 2 + 2R`. If that whole band is on one side of plan B's figure, no amount inside can change the answer and the stretch is skipped; otherwise it is split in two.

Why (a) holds, for the exact plan, in five steps. Write `B(k)` for the balance after payment `k`, `i(k)`, at most `i`, for the rate per payment then, and `P(k)` for the payment. Each step is checked on its own by section 13 of `tests/test_certified_money.mjs`, on the exact kernel.

1. One payment. `B(k) = max(0, B(k-1) x (1 + i(k)) - P(k) - e(k))`, where `e(k)` is any extra or lump paid then. Every payment rule Renew uses is continuous in the balance, with a slope between 0 and `1 + i(k)`: the formula's payment is the balance times a factor between 0 and `1 + i(k)` (for accelerated payments, a fixed share of the monthly figure); the floor, the interest plus one cent, has slope `i(k)`, and the larger of two continuous rules is still continuous; a payment worked out again at a rate change or a renewal is the formula on the balance then; the last payment is the whole balance plus its interest, which is where the `max` with 0 comes from. A held payment is a fixed share of the starting balance, so, leaving extras and lumps aside, every later balance is the starting balance times a factor that is never below 0 while the loan is owed. So one more dollar at the start never lowers a later balance, and raises it by at most `1 + i` per payment. Nothing here can jump.
2. Over the horizon. Repeating step 1, one more dollar of balance is between 0 and `(1 + i) ^ k` more dollars after `k` payments, so at most `G` at any payment in the horizon. A loan paid off inside the horizon has zero balance from then on, which only makes the change smaller.
3. Interest. The interest at payment `k` is `i(k)` times the balance it starts from, so it moves by at most `i x (1 + i) ^ (k - 1)` per dollar, and over `N` payments by at most `i x (1 + (1 + i) + ... + (1 + i) ^ (N - 1)) = G - 1`.
4. Extras and lumps. A dollar more paid at payment `j` lowers every later balance by between 0 and `(1 + i) ^ (k - j)` dollars, by the same steps, so it lowers the interest by at most `G - 1`. An extra is paid `N` times and a lump `floor(N / p)` times, which gives the factor `m`.
5. Everything paid. Paid is the interest plus the balance paid down, start balance minus end balance, exactly. So `by paid` adds the change in the end balance, at most `m x G`, and for `balance` the change in the start balance, 1.

That sum is `K` before the quarter is added. Section 13 also checks that this unwidened `K` holds by itself, on wide steps and on one cent steps across every payment rule above, and that the worst pair uses over nine tenths of it, so the quarter is a safety margin, not a patch for a gap in the steps.

Why sweeps and break evens hold `amortization to fit`. `amortization to fit` is worked out once, from the plan as written, before any sweep or break even runs, and every row of a sweep and every value a break even tries keeps it; a sweep or break even of `amortization` itself replaces it. The reason is one rule for every setting: a sweep or a break even changes exactly one setting and keeps every other setting as the plan as written has it. That makes every row checkable with one `compare` line, the same plan with that amortization written out, and `tests/test_certified_money.mjs` checks it on a rate sweep. Working the fit out again per row would change two settings at once, the one swept and the amortization. For `balance`, `extra` and `lump` break evens there is a second reason: the bound needs it, because an amortization worked out again for each amount would move in whole months, the payment would jump, and claim (a) would fail. For `rate`, `renews` and `term`, where every grid value is worked out, the bound plays no part and the one setting rule is the whole reason. The cost is plain: in those rows the amortization no longer fits the target payment, so at a higher rate the payment rises above it, and the note under every such result says the amortization is held and not worked out again. To see the amortization that fits at another rate, write a scenario with that rate and `amortization to fit`, or use `amortization needed for`. `tests/test_certified_money.mjs` also checks the money case on a fitted plan: the balance search stays certified, gives the same answer as the same plan with that amortization written out, agrees with a walk over every cent within $30 of the change, and claim (a) holds on 400 random pairs.

Why (b) holds. Renew rounds to the cent in exactly two places: the interest at each payment (off by at most half a cent), and the payment whenever it is worked out (at most half a cent; for accelerated payments the monthly figure and the share of it are both rounded, at most 0.75 of a cent). Principal and balance are differences of amounts already in cents, so they add no rounding. Each payment, the balance can therefore drift from the exact balance by at most 1.25 cents more than the drift before it grew by `(1 + i)`, so after `N` payments it is within `0.0125 x N x G` dollars; the formula allows 1.5 cents a payment. The interest at each payment is off by at most half a cent plus `i` times that balance drift, so over `N` payments by at most `0.005 x N + i x N x 0.015 x N x G`. `by paid` adds the drift of the end balance, at most `0.015 x N x G`. The sum is the bracket in `R`, widened by a quarter for safety. This is why `R` covers the largest rounding effect: one cent more of balance can move the rounded payment by a cent, which moves everything paid over `N` payments by about `N` cents, and `2R` is at least `1.25 x N` cents.

Status of the argument. It is a written derivation, not a machine checked proof. `tests/test_certified_money.mjs` checks it in these ways: the combined band on 5,000 random pairs of amounts; each half on its own, (a) on an exact copy of the kernel with rounding switched off and (b) by comparing that copy with the real kernel, on over 5,000 random amounts across every payment frequency, compounding, rate paths, renewals, renewal paths, `payment held`, lumps and extras; five windows brute forced over every cent, plus the 29 cent case in `examples/07-two-crossings.renew`; 24 random plan pairs where every cent within $25 of each change the search reports is walked; and, with no mortgage maths at all, 30 made up answers built to use all of `K` and all of `R`, with dips that reach just under, exactly at, or just over the target and two dips one cent apart, where the search must find exactly what a walk over every cent finds. Those last tests check the search logic at the edge of the bound; the mortgage tests check the bound itself. A random test is evidence, not proof, so "every cent is covered" in a note means: covered if this bound holds.

When the fallback applies. The certified search falls back to the sampled search in exactly two cases:

1. It has worked out 150,000 different amounts without finishing.
2. At some amount it tries, the plan worked out to the `N` payments of the horizon is neither paid off nor able to make all `N` payments. In the kernel that happens only if a payment stops covering that payment's interest, where the answer can jump and the bound does not hold.

Case 2 can no longer come from a valid plan. Before v1.9.0 it could: the payment, rounded to the cent, could fail to beat the interest, rounded to the cent, on a balance of a few dollars (at 2% over 25 years, $1.00 gave a $0.00 payment), so the plan was never repaid, and every `balance` search on such a plan fell back, because the range starts at $1.00. Since v1.9.0 every payment worked out is at least the interest on its starting balance plus one cent, so a payment always covers its interest: a held payment that would not is an error, not a fallback (see Rate paths), and the interest only falls as the balance falls. The check stays in the kernel as a guard. A test runs the search on a copy of the kernel with the older payment rule and shows case 2 firing at $1.00, with its reason in the note, while the real kernel stays certified on the same search; it also walks every balance from $1.00 to $1,000.00 on four plans, up to 30% over 50 years paid weekly, and none stops. On 2,000 ordinary plans the payment is exactly what it was before. The note names the reason for either case: "it worked out 150,000 amounts without finishing", or the amount at which a payment stopped covering its interest.

A plan paid off inside the horizon is not a fallback case. In `examples/07-two-crossings.renew` the largest lumps clear the loan in the first year, and that search stays certified. If an amount makes the plan an error, for example a held payment past its trigger rate, break even stops with that error and gives no answer. The sampled search tries 20,001 evenly spaced amounts ($500 apart for `balance` and `lump`, $2.50 apart for `extra`) and narrows each change to the cent. It covers only that grid: two changes closer together than one spacing can be missed. The note under the result says which search ran and, for the sampled one, the spacing.

The note under every break even result says which search ran, and gives the spacing when the sampled money search was used. When the answer changes once, it gives the second of those neighbours, the first value on the grid where the answer has changed for this model. Every figure is rounded to the cent, as in the schedule. It is not an exact continuous crossing: between two grid values the exact crossing is somewhere in between, and with amounts rounded to the cent it may not exist at all. The note under the result shows plan A at the grid value just before and at the answer, against plan B, so it can be checked with two `compare` lines. `break even renews for "Offered 1 year, then decide" against "Offered 5 year" by interest over 5 years` gives 4.889% in the 2026 example, and 5.388% with the discount input at 1%.

If the answer is the same at both ends of the range and never flips in between, the result says no value in the range changes it, and the note gives both ends. If the answer flips more than once, Renew does not pick a single value: `value` is null, the text says the answer changes more than once, and the note lists every crossing and the neighbouring values. That happens when the measure is not monotonic in the setting. `examples/07-two-crossings.renew` has two worked cases. In the first, against a 3 year plan, `break even amortization` for a 1 year, 25 year loan `by paid over 5 years` crosses at 3 years and at 5 years 4 months, because the amount paid over 5 years rises until the loan is just cleared in those 5 years, then falls as the payment shrinks. In the second, `break even lump` crosses at $15,997.68 and $15,997.97, 29 cents apart. The sampled search, $500 apart, finds neither; the certified search finds both.

`by interest` counts interest over the horizon, which already counts the different balances left (see Comparing plans fairly). `by paid` counts only the money paid over the horizon and ignores the balance still owed at the end, so a plan can pay less and still owe more; a note under the result says so. Use `by interest` to count both.

For `renews` the first plan's term must be shorter than the horizon, or the renewal rate makes no difference, and it cannot have a renewal path. For `rate` the plan cannot have a rate path. Both are errors at the line, because break even changes one rate.

## Measures

| Measure | Type | Meaning |
| --- | --- | --- |
| `payment` | money | The regular payment during the term |
| `yearly` | money | Regular payments plus extra payments over one year |
| `interest` | money | Interest paid during the term |
| `principal` | money | Principal repaid during the term, lump sums included |
| `balance` | money | Balance left at the end of the term |
| `paid` | money | Everything paid during the term, lump sums included |
| `renewal payment` | money | The regular payment after the term: worked out again at the `renews at` rate, the same payment when there is none, and $0.00 when the loan is paid off within the term |
| `rate` | percentage | The annual rate |
| `payoff` | length of time | Time to clear the loan, assuming the rate stays the same after the term, or is the `renews at` rate. The calculation stops at 1,000 years (see Rate paths) |
| `three months interest` | money | Balance at term end times rate times 3/12, a planning figure (see below) |
| `trigger rate` | percentage | The rate at which the first payment only covers the interest on the starting balance (see Rate paths) |

`yearly` is both a measure and a table. `yearly of "Plan"` is the measure, one year of payments. `show yearly "Plan"` prints the year by year table. The word `of` tells them apart.

## Comparing plans fairly

Interest, principal, paid and balance are measured over each plan's own term. A 1 year term and a 5 year term are therefore not like for like, so `compare` adds a note under the table whenever the plans have different terms and one of those measures is shown.

`compare "Renewal", "Offered 5 year" by interest, balance over 5 years` puts every plan on the same horizon: each one is followed for the same number of months. A plan whose term is shorter than the horizon carries on at its `renews at` rate, or at its own rate if it has none, and a note under the table says which. A plan whose term is longer than the horizon is cut off inside its term, and a note says that too. `payment`, `renewal payment`, `rate`, `yearly` and `payoff` do not change with the horizon.

Equal months are not the same months. A plan that started in 2021 and one that starts in 2026 can both be followed for 5 years, but they cover different years, so list the plans you mean rather than `compare all` when a program also holds history. The 2026 example shows the 2021 plan with `show` lines and keeps it out of the forward table.

Interest over a horizon already accounts for different balances left. For each plan, paid plus balance left equals the starting balance plus interest, so when the plans start from the same balance, the one with less interest has the lower total of money paid and still owed. A note under the table says this when interest is shown with balance or paid. It does not count when the money is paid.

When a plan in the table has `renews at`, a `Payment after term` column is added next to the payment, so the reset payment is not hidden.

Only `paid` names everything paid. `total` is refused with a hint to write `paid`, so the measure, the report heading and these docs use one word.

## Sweeps

`sweep "Renewal" rate from 4% to 7% step 0.5%` makes one row per value of one setting, with every other setting held as the plan states it. A sweep of the renewal rate can be written `sweep "Plan" renews at from 4% to 6% step 0.5%` or `sweep "Plan" renews from 4% to 6% step 0.5%`. An amortization set with `amortization to fit` is worked out once, from the plan as written, and every row keeps it, because a sweep changes one setting only; a note under the table says so (see "Why sweeps and break evens hold `amortization to fit`" under Break even). The values after `from`, `to` and `step` must have the setting's type: percentages for `rate` and `renews`, money for `balance`, `extra` and `lump`, lengths of time for `amortization` and `term`. A mismatch is a type error before anything runs. A sweep takes `by` and `over` like `compare`, and `against "Plan"` adds that plan as a last row, marked for comparison, so the rows can be read against a fixed choice. It stops at 60 rows, and every row is checked with the same rules as a plan. A `renews` sweep that shows `payment` also shows `Payment after term`, because the payment in the term is the same in every row and the payment after it is the one that changes.

`sweep "Offered 1 year, then decide" renews from 3.5% to 6% step 0.5% over 5 years against "Offered 5 year"` is the simplest rate path Renew offers: one rate for the term, a range of possible rates after it, and the 5 year offer underneath for comparison.

`rate needed for "Plan" at $X` is the highest annual rate, to 0.01%, that keeps the payment at or under `$X`. `amortization needed for "Plan" at $X` is the shortest whole number of months, up to 50 years, whose payment fits.

## The maths

For an annual rate `r` compounded `c` times a year and paid `p` times a year, the rate per payment is

```
i = (1 + r / c) ^ (c / p) - 1
```

The default `c = 2`, half yearly, is the usual Canadian convention for fixed rate mortgages. It is a modelling default, not a rule the law imposes on the calculation. The Interest Act, R.S.C. 1985, c. I-15, s. 6, deals with disclosure: for a mortgage on a blended payment, sinking fund or similar plan, no interest is recoverable unless the mortgage contains a statement of the principal and "the rate of interest chargeable on that money, calculated yearly or half-yearly, not in advance". So s. 6 allows yearly or half yearly as the basis for the stated rate, and Renew offers both (`compounded annually`, `compounded semi-annually`). A contract that compounds monthly can say `compounded monthly`.

The blended payment for balance `L` over `n` payments is

```
payment = L x i / (1 - (1 + i) ^ -n)
```

rounded to the cent, with `n = amortization in years x p`. Accelerated biweekly is the monthly payment divided by 2, paid 26 times a year. Accelerated weekly is the monthly payment divided by 4, paid 52 times a year.

A payment worked out this way is never less than the interest on the balance it starts from, rounded to the cent, plus one cent. For an ordinary loan the formula already gives far more, so this changes nothing; it only matters for a balance of a few dollars, or a very high rate over a very long amortization, where the rounded formula payment could otherwise fail to cover the interest and the loan would never be repaid. The same rule applies whenever the payment is worked out again.

The schedule works one payment at a time. Interest is `balance x i`, rounded to the cent. The rest of the payment, plus any extra, reduces the balance. A lump sum is applied after every `p` payments. The last payment absorbs the rounding so the loan ends at exactly $0.00.

After the term, if `renews at` is set, the periodic rate becomes the one for that rate and the payment is worked out again with the same formula on the balance left over the remaining payments. Every step of a rate path, inside the term or after it, works the same way: new periodic rate, then a new payment on the balance left over the payments remaining. For accelerated payments the monthly payment over the remaining months is worked out first and rounded to the cent, then divided by 2 or 4, the same as at the start. A `payment held` plan keeps its payment at a change inside the term instead, and the last payment is whatever clears the balance, however long that takes.

`three months interest` is the balance at the end of the term times the rate times 3/12. It is a planning figure. Many contracts set their own prepayment charge, and Renew does not model those. The Interest Act, s. 10 (1), gives a statutory version only in a narrow case: where principal or interest under the mortgage is not payable until more than five years after the date of the mortgage, a person may, at any time after those five years, pay what is due plus "three months further interest in lieu of notice". Section 10 (2) (a) says this does not apply to a mortgage given by a joint stock company or any other corporation, nor to a debenture issued by one of them that is secured by a mortgage, and s. 10 (2) (b) says the same for a prescribed mortgage given by a prescribed entity, or a prescribed debenture issued by it that is secured by a mortgage (checked against the statute on November 20, 2026). Renew does not model s. 10; whether it applies to a renewed charge depends on the mortgage documents. For example, if a renewal amends the original 2021 charge, the date of the mortgage may be read as 2021.

Statute text read on November 19, 2026, America/Toronto, from https://laws-lois.justice.gc.ca/eng/acts/I-15/FullText.html .

These formulas are tested against closed forms in `tests/test_math.mjs`, including the classic $100,000 at 5% over 25 years, which gives $581.60 a month.

## Posted rates

`posted 5 year on 2026-11-18` reads `data/posted_rates.json`, a copy of three Bank of Canada Valet series retrieved on November 19, 2026, America/Toronto:

- V80691333, Conventional mortgage, 1-year
- V80691334, Conventional mortgage, 3-year
- V80691335, Conventional mortgage, 5-year

The Bank describes V80691335 as "The interest rate for a 5-year conventional mortgage offered by chartered banks in Canada." The 1-year and 3-year series use the same words with "1-year" and "3-year". All three are weekly, in percent, January 6, 2016 to November 18, 2026. Renew uses the latest week on or before the date. A date before the first week is an error.

Renew policy, not a Bank of Canada rule, because the series is weekly and the next week would not be published yet: A date up to six days after the last week in the bundled copy reads that last week; a date later than that is an error. In this copy the last week is November 18, 2026, so dates from November 19 to November 24, 2026 read the November 18 week, and November 25, 2026 or later is an error. Renew does not guess a rate it does not have. The error gives the last date the copy covers and two ways on: type the rate, or update the copy.

`npm run rates` updates the copy. It downloads the three series from the Valet address below, checks the columns, the dates and that every rate is between 0% and 30%, and only then rewrites `data/boc_conventional_mortgage_2016_2026.csv`, `data/posted_rates.json` and `src/posted_rates.js`. If anything looks wrong it stops and changes nothing. `node scripts/rates.mjs saved.csv` rebuilds from a saved download without the network. Run on November 19, 2026, it found no week after November 18, 2026, so the copy is unchanged.

Source: https://www.bankofcanada.ca/valet/observations/V80691333,V80691334,V80691335/csv?start_date=2016-01-01 . Terms of use: https://www.bankofcanada.ca/terms/ . These are posted rates, a published reference point. They are not a quote and not a limit: many borrowers are offered less, and a particular borrower can be quoted more. Type the rate you were offered beside them.

## Errors

Every error has a line, a column, a plain message and, where it helps, a hint:

```
Line 7, column 8: rate must be a percentage, not a plain number.
    rate 6.05 fixed
         ^
  Add a percent sign, like 6.05%.
```
