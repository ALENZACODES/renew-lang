# Renew language reference

Renew programs are plain text files ending in `.renew`. A program is a list of lines. A line that starts at the left edge is a statement. A line that starts with spaces is a setting that belongs to the `mortgage` or `scenario` above it. `#` starts a comment. Keywords are not case sensitive. Names in quotes are.

## Grammar

```ebnf
program     = { line } ;
line        = statement | setting | comment | blank ;

statement   = mortgage | scenario | let | compare | show | explain | check ;
mortgage    = "mortgage" NAME ;
scenario    = "scenario" NAME [ "from" NAME ] ;
let         = "let" IDENT "=" expr ;
compare     = "compare" [ "all" | NAME { "," NAME } ] [ "by" measure { "," measure } ] ;
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
                     | "lump" expr "every" "year" ) ;
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
measure     = "payment" | "yearly" | "interest" | "principal" | "balance" | "total"
            | "rate" | "payoff" | "three" "months" "interest" ;

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

## Plans

A `mortgage` needs `balance`, `rate`, `amortization` and `term`. `compounded` defaults to `semi-annually` and `payments` defaults to `monthly`.

A `scenario` starts from a copy of a mortgage (the one named after `from`, or the nearest `mortgage` above it) and replaces only the settings written under it. Names are set once. Using a name before it exists is an error, with a suggestion when a close name exists.

## Measures

| Measure | Type | Meaning |
| --- | --- | --- |
| `payment` | money | The regular payment |
| `yearly` | money | Regular payments plus extra payments over one year |
| `interest` | money | Interest paid during the term |
| `principal` | money | Principal repaid during the term, lump sums included |
| `balance` | money | Balance left at the end of the term |
| `total` | money | Everything paid during the term |
| `rate` | percentage | The annual rate |
| `payoff` | length of time | Time to clear the loan if nothing changes |
| `three months interest` | money | Balance at term end times rate times 3/12 |

`rate needed for "Plan" at $X` is the highest annual rate, to 0.01%, that keeps the payment at or under `$X`. `amortization needed for "Plan" at $X` is the shortest whole number of months, up to 50 years, whose payment fits.

## The maths

For an annual rate `r` compounded `c` times a year and paid `p` times a year, the rate per payment is

```
i = (1 + r / c) ^ (c / p) - 1
```

The default `c = 2` follows the Canadian statement convention for mortgages in the Interest Act, R.S.C. 1985, c. I-15, s. 6, which requires the rate to be shown "calculated yearly or half-yearly, not in advance". A variable rate mortgage that compounds monthly can say `compounded monthly`.

The blended payment for balance `L` over `n` payments is

```
payment = L x i / (1 - (1 + i) ^ -n)
```

rounded to the cent, with `n = amortization in years x p`. Accelerated biweekly is the monthly payment divided by 2, paid 26 times a year. Accelerated weekly is the monthly payment divided by 4, paid 52 times a year.

The schedule works one payment at a time. Interest is `balance x i`, rounded to the cent. The rest of the payment, plus any extra, reduces the balance. A lump sum is applied after every `p` payments. The last payment absorbs the rounding so the loan ends at exactly $0.00.

`three months interest` is the figure in the Interest Act, s. 10 (1): on a mortgage that runs more than five years, after five years a borrower may repay with "three months further interest in lieu of notice". Many contracts set their own prepayment charges. Renew shows this one figure and nothing more.

These formulas are tested against closed forms in `tests/test_math.mjs`, including the classic $100,000 at 5% over 25 years, which gives $581.60 a month.

## Posted rates

`posted 5 year on 2026-11-18` reads `data/posted_rates.json`, a copy of three Bank of Canada Valet series retrieved on November 19, 2026, America/Toronto:

- V80691333, Conventional mortgage, 1-year
- V80691334, Conventional mortgage, 3-year
- V80691335, Conventional mortgage, 5-year

Each is described by the Bank as "the interest rate for a conventional mortgage offered by chartered banks in Canada", weekly, in percent, January 6, 2016 to November 18, 2026. Renew uses the latest week on or before the date. Dates before the first week, or more than six days after the last week, are errors. Renew does not guess a rate it does not have.

Source: https://www.bankofcanada.ca/valet/observations/V80691333,V80691334,V80691335/csv?start_date=2016-01-01 . Terms of use: https://www.bankofcanada.ca/terms/ . These are posted rates. Many borrowers are offered lower rates, so treat them as a ceiling for planning, not a quote.

## Errors

Every error has a line, a column, a plain message and, where it helps, a hint:

```
Line 7, column 8: rate must be a percentage, not a plain number.
    rate 6.05 fixed
         ^
  Add a percent sign, like 6.05%.
```
