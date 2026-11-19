# Renew language reference

Renew programs are plain text files ending in `.renew`. A program is a list of lines. A line that starts at the left edge is a statement. A line that starts with spaces is a setting that belongs to the `mortgage` or `scenario` above it. `#` starts a comment. Keywords are not case sensitive. Names in quotes are.

## Grammar

```ebnf
program     = { line } ;
line        = statement | setting | comment | blank ;

statement   = mortgage | scenario | let | compare | sweep | show | explain | check ;
mortgage    = "mortgage" NAME ;
scenario    = "scenario" NAME [ "from" NAME ] ;
let         = "let" IDENT "=" expr ;
compare     = "compare" [ "all" | NAME { "," NAME } ] [ "by" measures ] [ "over" sum ] ;
sweep       = "sweep" NAME swept "from" sum "to" sum "step" sum [ "by" measures ] [ "over" sum ] [ "against" NAME ] ;
swept       = "rate" | "balance" | "amortization" | "term" | "extra" | "lump" | "renews" ;
measures    = measure { "," measure } ;
show        = "show" ( ( "schedule" | "yearly" ) NAME [ "first" INTEGER ] | expr ) ;
explain     = "explain" NAME ;
check       = "check" expr ;                     (* must be a comparison *)

setting     = INDENT ( "balance" expr
                     | "rate" expr [ "fixed" | "variable" ]
                     | "compounded" ( "semi-annually" | "monthly" | "annually" )
                     | "amortization" expr [ "remaining" ]
                     | "payments" frequency
                     | "term" expr
                     | "extra" expr "per" "payment"
                     | "lump" expr "every" "year"
                     | "renews" "at" expr ) ;
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
            | "posted" ( "1" | "3" | "5" ) "year" "on" DATE
            | ( "min" | "max" ) "(" expr "," expr ")" ;
duration    = ( "year" | "years" ) [ NUMBER ( "month" | "months" ) ] | "month" | "months" ;
measure     = "payment" | "renewal" "payment" | "yearly" | "interest" | "principal" | "balance"
            | "paid" | "rate" | "payoff" | "three" "months" "interest" ;

MONEY   = "$" digits ;        (* $412,500 or $2,600.50; commas must group thousands *)
PERCENT = digits "%" ;        (* 4.79% *)
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

`fixed` or `variable` after a rate is a label and nothing more. Renew works out every plan as if the rate you write holds for the whole term. A variable rate that moves during the term is not modelled. To see what a different rate would do, use `renews at` for the rate after the term, or `sweep` across a range of rates. Every result that involves a plan marked `variable` carries a warning: a note under any `compare` or `sweep` table it appears in, a note under any `show` value that uses it, and a line in `explain`. The playground shows these warnings in a box of their own.

A `rate` written as `posted N year on DATE` and nothing else is a posted benchmark. Any other rate, including `posted 5 year on 2026-11-18 - discount`, is a typed rate. When one table mixes the two, a note says so, because posted rates are usually higher than the rates lenders offer.

`amortization 20 years remaining` reads the same as `amortization 20 years`. The word `remaining` is there so a renewal can say what it means; it changes nothing. The amortization is always counted from the start of the plan it is written in.

`renews at 5.5%` sets the rate after the term ends. At the end of the term the payment is worked out again on the balance left, over the rest of the amortization, the way a renewal resets it. Without `renews at`, the rate after the term is assumed to stay the same. Either way it is an assumption, not a forecast.

A `scenario` starts from a copy of a mortgage (the one named after `from`, or the nearest `mortgage` above it) and replaces only the settings written under it. Names are set once. Using a name before it exists is an error, with a suggestion when a close name exists.

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
| `payoff` | length of time | Time to clear the loan, assuming the rate stays the same after the term, or is the `renews at` rate |
| `three months interest` | money | Balance at term end times rate times 3/12, a planning figure (see below) |

`yearly` is both a measure and a table. `yearly of "Plan"` is the measure, one year of payments. `show yearly "Plan"` prints the year by year table. The word `of` tells them apart.

## Comparing plans fairly

Interest, principal, paid and balance are measured over each plan's own term. A 1 year term and a 5 year term are therefore not like for like, so `compare` adds a note under the table whenever the plans have different terms and one of those measures is shown.

`compare "Renewal", "Offered 5 year" by interest, balance over 5 years` puts every plan on the same horizon: each one is followed for the same number of months. A plan whose term is shorter than the horizon carries on at its `renews at` rate, or at its own rate if it has none, and a note under the table says which. A plan whose term is longer than the horizon is cut off inside its term, and a note says that too. `payment`, `renewal payment`, `rate`, `yearly` and `payoff` do not change with the horizon.

Equal months are not the same months. A plan that started in 2021 and one that starts in 2026 can both be followed for 5 years, but they cover different years, so list the plans you mean rather than `compare all` when a program also holds history. The 2026 example shows the 2021 plan with `show` lines and keeps it out of the forward table.

Interest over a horizon already accounts for different balances left. For each plan, paid plus balance left equals the starting balance plus interest, so when the plans start from the same balance, the one with less interest has the lower total of money paid and still owed. A note under the table says this when interest is shown with balance or paid. It does not count when the money is paid.

When a plan in the table has `renews at`, a `Payment after term` column is added next to the payment, so the reset payment is not hidden.

Only `paid` names everything paid. `total` is refused with a hint to write `paid`, so the measure, the report heading and these docs use one word.

## Sweeps

`sweep "Renewal" rate from 4% to 7% step 0.5%` makes one row per value of one setting, with every other setting held as the plan states it. The values after `from`, `to` and `step` must have the setting's type: percentages for `rate` and `renews`, money for `balance`, `extra` and `lump`, lengths of time for `amortization` and `term`. A mismatch is a type error before anything runs. A sweep takes `by` and `over` like `compare`, and `against "Plan"` adds that plan as a last row, marked for comparison, so the rows can be read against a fixed choice. It stops at 60 rows, and every row is checked with the same rules as a plan. A `renews` sweep that shows `payment` also shows `Payment after term`, because the payment in the term is the same in every row and the payment after it is the one that changes.

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

The schedule works one payment at a time. Interest is `balance x i`, rounded to the cent. The rest of the payment, plus any extra, reduces the balance. A lump sum is applied after every `p` payments. The last payment absorbs the rounding so the loan ends at exactly $0.00.

After the term, if `renews at` is set, the periodic rate becomes the one for that rate and the payment is worked out again with the same formula on the balance left over the remaining payments. For accelerated payments the monthly payment over the remaining months is worked out first, then divided by 2 or 4.

`three months interest` is the balance at the end of the term times the rate times 3/12. It is a planning figure. Many contracts set their own prepayment charge, and Renew does not model those. The Interest Act, s. 10 (1), gives a statutory version only in a narrow case: where principal or interest under the mortgage is not payable until more than five years after the date of the mortgage, a person may, at any time after those five years, pay what is due plus "three months further interest in lieu of notice". Section 10 (2) says this does not apply to a mortgage given by a joint stock company or other corporation, or to certain prescribed mortgages. For the 1, 3 and 5 year terms in the examples, s. 10 does not apply.

Statute text read on November 19, 2026, America/Toronto, from https://laws-lois.justice.gc.ca/eng/acts/I-15/FullText.html .

These formulas are tested against closed forms in `tests/test_math.mjs`, including the classic $100,000 at 5% over 25 years, which gives $581.60 a month.

## Posted rates

`posted 5 year on 2026-11-18` reads `data/posted_rates.json`, a copy of three Bank of Canada Valet series retrieved on November 19, 2026, America/Toronto:

- V80691333, Conventional mortgage, 1-year
- V80691334, Conventional mortgage, 3-year
- V80691335, Conventional mortgage, 5-year

The Bank describes V80691335 as "The interest rate for a 5-year conventional mortgage offered by chartered banks in Canada." The 1-year and 3-year series use the same words with "1-year" and "3-year". All three are weekly, in percent, January 6, 2016 to November 18, 2026. Renew uses the latest week on or before the date. A date before the first week is an error.

Renew policy, not a Bank of Canada rule: a date up to six days after the last week in the bundled copy reads that last week, because the series is weekly and the next week would not be published yet; a date later than that is an error. Renew does not guess a rate it does not have.

Source: https://www.bankofcanada.ca/valet/observations/V80691333,V80691334,V80691335/csv?start_date=2016-01-01 . Terms of use: https://www.bankofcanada.ca/terms/ . These are posted rates, a published reference point. They are not a quote and not a limit: many borrowers are offered less, and a particular borrower can be quoted more. Type the rate you were offered beside them.

## Errors

Every error has a line, a column, a plain message and, where it helps, a hint:

```
Line 7, column 8: rate must be a percentage, not a plain number.
    rate 6.05 fixed
         ^
  Add a percent sign, like 6.05%.
```
