"""Independent figures for Renew, by John Khan.

A separate implementation in Python with decimal arithmetic. It shares no code with src/kernel.js. It
writes tests/fixtures/independent.json, which tests/test_independent.mjs compares with what the Renew
programs give. Run: python3 tests/verify/independent.py

Rules it follows (the model Renew documents in docs/LANGUAGE.md):
- rate per payment i = (1 + r / c) ^ (c / p) - 1, for r compounded c times a year, paid p times a year
- blended payment = L i / (1 - (1 + i) ^ -n), rounded to the cent; accelerated payments are the monthly
  payment divided by 2 (biweekly) or 4 (weekly)
- each payment: interest = balance x i rounded to the cent; the last payment clears the balance
- a rate change k = round(months / 12 x p) payments in: the payment is worked out again on the balance over
  what is left of the amortization, unless the payment is held, in which case it stays and the loan runs on
  until it is paid (the last payment n only clears the balance when no kept payment has stretched the loan)
- a lump sum comes off after every p-th payment
- at renewal the payment is worked out again over what is left of the amortization, held payment or not
- the loan runs until it is paid; a held payment that barely covers the interest can run past the
  amortization, and the payoff is the real one, not a stop at 100 years
"""
from decimal import Decimal as D, ROUND_HALF_UP, getcontext
import json, os, sys
getcontext().prec = 50
def c2(x): return x.quantize(D("0.01"), rounding=ROUND_HALF_UP)
def per_rate(r, c, p): return (1 + D(str(r)) / 100 / c) ** (D(c) / D(p)) - 1
def ann(L, i, n): return L / n if i == 0 else L * i / (1 - (1 + i) ** (-n))
FREQ = {"monthly": (12, None), "biweekly": (26, None), "weekly": (52, None), "semi-monthly": (24, None),
        "accelerated biweekly": (26, 2), "accelerated weekly": (52, 4)}
COMP = {"semi-annually": 2, "monthly": 12, "annually": 1}

def simulate(case):
    p, accel = FREQ[case.get("payments", "monthly")]
    c = COMP[case.get("compounded", "semi-annually")]
    L = D(str(case["balance"])); A = case["amortization"]; T = case["term"]
    n = round(A / 12 * p)
    def pay_for(bal, r, months_left, payments_left):
        if accel: return c2(c2(ann(bal, per_rate(r, c, 12), months_left)) / accel)
        return c2(ann(bal, per_rate(r, c, p), payments_left))
    changes = []
    at = 0
    for r, after in case.get("path", []):
        at += after; changes.append((round(at / 12 * p), at, r, False))
    if "renews" in case:
        changes.append((round(T / 12 * p), T, case["renews"], True))
    i = per_rate(case["rate"], c, p)
    pay = pay_for(L, case["rate"], A, n)
    first = pay
    held = case.get("held", False)
    extra = D(str(case.get("extra", 0))); lump = D(str(case.get("lump", 0)))
    bal = L; k = 0; rows = []; stretched = False
    while bal > 0 and k < 1000 * p:  # runs to the real payoff; 1,000 years only stops a loop that never ends
        for (ck, months, r, renewal) in changes:
            if ck != k: continue
            i = per_rate(r, c, p)
            if held and not renewal:
                assert pay > c2(bal * i), "payment no longer covers interest"
                stretched = True
                continue
            if renewal: held = False; stretched = False
            pay = pay_for(bal, r, A - months, n - k)
        k += 1
        interest = c2(bal * i)
        amount = pay + extra
        if (k >= n and not (held and stretched)) or amount - interest >= bal: amount = c2(bal + interest)
        bal = c2(bal - (amount - interest))
        lp = D(0)
        if lump > 0 and k % p == 0 and bal > 0:
            lp = min(lump, bal); bal = c2(bal - lp)
        rows.append((amount, interest, lp, bal))
    H = round(case["horizon"] / 12 * p)
    part = rows[:H]
    import math
    payoff = math.ceil(len(rows) / p * 12 - 1e-9)
    return {
        "payment": float(first),
        "interest": float(c2(sum((r[1] for r in part), D(0)))),
        "paid": float(c2(sum((r[0] + r[2] for r in part), D(0)))),
        "balance": float(D(0) if len(part) < H else part[-1][3]),
        "payoff": payoff,
    }

def program(case):
    lines = ['mortgage "Case"', "  balance $" + format(case["balance"], ",")]
    rate = "  rate " + str(case["rate"]) + "%"
    for r, after in case.get("path", []): rate += " then " + str(r) + "% after " + str(after) + " months"
    if case.get("held"): rate += " payment held"
    lines.append(rate)
    lines.append("  amortization " + str(case["amortization"]) + " months")
    lines.append("  term " + str(case["term"]) + " months")
    if "payments" in case: lines.append("  payments " + case["payments"])
    if "compounded" in case: lines.append("  compounded " + case["compounded"])
    if case.get("extra"): lines.append("  extra $" + str(case["extra"]) + " per payment")
    if case.get("lump"): lines.append("  lump $" + format(case["lump"], ",") + " every year")
    if "renews" in case: lines.append("  renews at " + str(case["renews"]) + "%")
    lines.append("compare by payment, interest, paid, balance, payoff over " + str(case["horizon"]) + " months")
    return "\n".join(lines) + "\n"

CASES = [
    {"id": "three rate changes", "balance": 450000, "rate": 4.1, "path": [(4.6, 6), (5.25, 6), (4.8, 12)], "amortization": 300, "term": 36, "horizon": 36},
    {"id": "rate changes with extra", "balance": 380000, "rate": 5.0, "path": [(4.4, 9), (3.9, 15)], "amortization": 300, "term": 36, "extra": 250, "horizon": 36},
    {"id": "lump sum then renewal", "balance": 520000, "rate": 4.69, "amortization": 240, "term": 12, "lump": 15000, "renews": 5.1, "horizon": 60},
    {"id": "accelerated biweekly renewal", "balance": 441063.33, "rate": 3.99, "amortization": 240, "term": 12, "payments": "accelerated biweekly", "renews": 4.5, "horizon": 60},
    {"id": "accelerated weekly with path", "balance": 300000, "rate": 5.2, "path": [(4.95, 12)], "amortization": 300, "term": 36, "payments": "accelerated weekly", "horizon": 36},
    {"id": "short horizon inside the term", "balance": 410000, "rate": 4.84, "amortization": 300, "term": 60, "horizon": 7},
    {"id": "short horizon past a short term", "balance": 410000, "rate": 4.2, "amortization": 300, "term": 6, "renews": 5.4, "horizon": 9},
    {"id": "weekly, monthly compounding, extra and lump", "balance": 275000, "rate": 6.1, "amortization": 180, "term": 24, "payments": "weekly", "compounded": "monthly", "extra": 40, "lump": 5000, "horizon": 24},
    {"id": "payment held, one rise", "balance": 400000, "rate": 4.2, "path": [(5.5, 6)], "held": True, "amortization": 300, "term": 36, "horizon": 36},
    {"id": "payment held, rise then fall", "balance": 500000, "rate": 3.95, "path": [(5.1, 4), (5.6, 8), (4.7, 12)], "held": True, "amortization": 300, "term": 60, "horizon": 60},
    {"id": "payment held, then renewal", "balance": 400000, "rate": 4.2, "path": [(5.5, 6)], "held": True, "amortization": 300, "term": 36, "renews": 5.0, "horizon": 60},
    {"id": "payment held just under the later trigger", "balance": 400000, "rate": 4.2, "path": [(6.60, 6)], "held": True, "amortization": 300, "term": 36, "horizon": 36},
        {"id": "payment held with extra, biweekly", "balance": 350000, "rate": 4.5, "path": [(5.75, 10)], "held": True, "amortization": 300, "term": 36, "payments": "biweekly", "extra": 100, "horizon": 36},
]
out = []
for case in CASES:
    out.append({"id": case["id"], "program": program(case), "want": simulate(case)})
here = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(here, "..", "fixtures", "independent.json")
payload = {"note": "Generated by tests/verify/independent.py, a separate Python implementation with decimal arithmetic. Do not edit by hand.", "cases": out}
check = "--check" in sys.argv
if check:
    with open(path) as f: existing = json.load(f)
    if existing != payload:
        sys.stderr.write("tests/fixtures/independent.json is out of date. Run: python3 tests/verify/independent.py\n")
        # show a short hint of what changed
        import difflib
        a = json.dumps(existing, indent=1).splitlines()
        b = json.dumps(payload, indent=1).splitlines()
        sys.stderr.write("\n".join(difflib.unified_diff(a, b, fromfile="committed", tofile="regenerated", lineterm="")) + "\n")
        sys.exit(1)
    print("independent fixtures match the regenerated Python figures,", len(out), "cases")
else:
    with open(path, "w") as f: json.dump(payload, f, indent=1)
    print("wrote", len(out), "cases to", os.path.normpath(path))
