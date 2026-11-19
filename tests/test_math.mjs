// The rate maths, checked against closed forms that do not share code with the kernel.
import { Renew, eq, near, ok, done } from "./helpers.mjs";
const K = Renew.kernel;

// Classic check: $100,000 at 5% compounded half yearly, 25 years, monthly. i = 1.025^(1/6) - 1.
const i = Math.pow(1.025, 1 / 6) - 1;
near("periodic rate", K.periodicRate(5, 2, 12), i, 1e-15);
const exact = 100000 * i / (1 - Math.pow(1 + i, -300));
eq("payment rounds to the cent", K.plan({ name: "a", balance: 100000, rate: 5, compounded: "semi-annually", amortization: 300, payments: "monthly", term: 60 }).payment, Math.round(exact * 100) / 100);
eq("payment value", K.money(Math.round(exact * 100) / 100), "$581.60");

// Balance after k payments: B = L(1+i)^k - P((1+i)^k - 1)/i. Cent rounding each month may drift a little.
for (const [rate, comp, freq, years, L] of [[5, "semi-annually", "monthly", 25, 100000], [6.19, "semi-annually", "monthly", 20, 441063.33], [5.2, "monthly", "biweekly", 25, 600000], [3.5, "annually", "weekly", 15, 250000], [7.25, "semi-annually", "semi-monthly", 30, 900000]]) {
  const p = K.plan({ name: "b", balance: L, rate, compounded: comp, amortization: years * 12, payments: freq, term: 60 });
  const c = K.COMPOUND[comp], f = K.FREQ[freq].per, r = Math.pow(1 + rate / 100 / c, c / f) - 1, k = p.termPayments;
  const closed = L * Math.pow(1 + r, k) - p.payment * (Math.pow(1 + r, k) - 1) / r;
  near(`closed form balance ${rate}% ${freq}`, p.balance, closed, 0.01 * k);
  // interest + principal in term add up to what was paid
  near(`split adds up ${rate}% ${freq}`, p.interest + p.principal, p.paid, 0.011);
  // a full amortization ends at zero with the scheduled number of payments
  const full = K.plan({ name: "c", balance: L, rate, compounded: comp, amortization: years * 12, payments: freq, term: years * 12 });
  eq(`full schedule clears ${rate}% ${freq}`, full.balance, 0);
  eq(`full schedule length ${rate}% ${freq}`, full.rows.length, years * f);
  eq(`payoff equals amortization ${rate}% ${freq}`, full.payoff, years * 12);
}

// Zero rate: straight division.
eq("zero rate", K.plan({ name: "z", balance: 120000, rate: 0, compounded: "semi-annually", amortization: 120, payments: "monthly", term: 12 }).payment, 1000);

// Accelerated biweekly is half the monthly payment, paid 26 times a year.
const m = K.plan({ name: "m", balance: 380000, rate: 6.19, compounded: "semi-annually", amortization: 264, payments: "monthly", term: 60 });
const ab = K.plan({ name: "ab", balance: 380000, rate: 6.19, compounded: "semi-annually", amortization: 264, payments: "accelerated biweekly", term: 60 });
eq("accelerated is half", ab.payment, Math.round(m.payment / 2 * 100) / 100);
ok("accelerated pays off sooner", ab.payoff < m.payoff);
const aw = K.plan({ name: "aw", balance: 380000, rate: 6.19, compounded: "semi-annually", amortization: 264, payments: "accelerated weekly", term: 60 });
eq("accelerated weekly is a quarter", aw.payment, Math.round(m.payment / 4 * 100) / 100);

// Extra payments and lump sums only ever shorten the loan and cut interest.
const ex = K.plan(Object.assign({}, m.spec, { extra: 250 }));
const lu = K.plan(Object.assign({}, m.spec, { lump: 6000 }));
ok("extra cuts interest", ex.interest < m.interest && ex.payoff < m.payoff);
ok("lump cuts interest", lu.interest < m.interest && lu.payoff < m.payoff);
eq("lump lands after payment 12", lu.rows[11].lump, 6000);
eq("no lump before", lu.rows[10].lump, 0);

// Monthly compounding gives a higher effective rate than half yearly at the same nominal rate.
ok("monthly compounding costs more", K.periodicRate(6, 12, 12) > K.periodicRate(6, 2, 12));

// Solvers
const spec = Object.assign({}, m.spec);
const r = K.rateNeeded(spec, 2400);
ok("rate needed fits", K.plan(Object.assign({}, spec, { rate: r })).payment <= 2400);
ok("rate needed is the highest to 0.01", K.plan(Object.assign({}, spec, { rate: r + 0.01 })).payment > 2400);
const a = K.amortizationNeeded(spec, 2400);
ok("amortization needed fits", K.plan(Object.assign({}, spec, { amortization: a })).payment <= 2400);
ok("amortization needed is the shortest", K.plan(Object.assign({}, spec, { amortization: a - 1 })).payment > 2400);
eq("no rate fits a tiny budget", K.rateNeeded(spec, 100), null);

// Formatting
eq("money", K.money(1234567.4), "$1,234,567.40");
eq("money rounds half up", K.money(2.675 + 1e-9), "$2.68");
eq("negative money", K.money(-339.85), "-$339.85");
eq("duration", K.dur(250), "20 years 10 months");
eq("one month", K.dur(1), "1 month");
eq("percent", K.pct(6.19), "6.19%");
done("math");
