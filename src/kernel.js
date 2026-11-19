// Renew kernel: the mortgage math and the text report. Shared by the interpreter and by compiled programs.
// The compiler copies this function's source into every compiled program, so keep it self contained.
function renewKernel() {
  "use strict";
  const FREQ = {
    "monthly": { per: 12, label: "monthly" },
    "semi-monthly": { per: 24, label: "semi-monthly" },
    "biweekly": { per: 26, label: "biweekly" },
    "weekly": { per: 52, label: "weekly" },
    "accelerated biweekly": { per: 26, label: "accelerated biweekly", accel: 2 },
    "accelerated weekly": { per: 52, label: "accelerated weekly", accel: 4 }
  };
  const COMPOUND = { "semi-annually": 2, "monthly": 12, "annually": 1 };
  function cents(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
  // Effective rate per payment for an annual nominal rate compounded c times a year, paid p times a year.
  function periodicRate(ratePct, c, p) { return Math.pow(1 + ratePct / 100 / c, c / p) - 1; }
  // Blended payment that clears balance L over n payments at periodic rate i.
  function annuity(L, i, n) { return i === 0 ? L / n : (L * i) / (1 - Math.pow(1 + i, -n)); }
  function plan(spec) {
    const f = FREQ[spec.payments];
    const c = COMPOUND[spec.compounded];
    const i = periodicRate(spec.rate, c, f.per);
    const n = Math.round((spec.amortization / 12) * f.per);
    let payment, base = null;
    if (f.accel) {
      const im = periodicRate(spec.rate, c, 12);
      base = cents(annuity(spec.balance, im, spec.amortization));
      payment = cents(base / f.accel);
    } else {
      payment = cents(annuity(spec.balance, i, n));
    }
    const termPayments = Math.round((spec.term / 12) * f.per);
    const extra = spec.extra || 0, lump = spec.lump || 0;
    const rows = [];
    let bal = spec.balance, k = 0, interestTerm = 0, principalTerm = 0, paidTerm = 0;
    while (bal > 0.004 && k < 100 * f.per) {
      k++;
      const interest = cents(bal * i);
      let pay = payment + extra;
      if (k >= n || pay - interest >= bal) pay = cents(bal + interest); // the last payment absorbs rounding
      let principal = cents(pay - interest);
      let lumpHere = 0;
      bal = cents(bal - principal);
      if (lump > 0 && k % f.per === 0 && bal > 0) { lumpHere = Math.min(lump, bal); bal = cents(bal - lumpHere); }
      if (k <= termPayments) {
        interestTerm += interest; principalTerm += principal + lumpHere; paidTerm += pay + lumpHere;
        rows.push({ n: k, payment: pay, interest: interest, principal: principal, lump: lumpHere, balance: bal });
      }
      if (pay <= interest) { k = Infinity; break; }
    }
    const payoffMonths = Number.isFinite(k) ? Math.ceil((k / f.per) * 12 - 1e-9) : Infinity;
    return {
      name: spec.name, spec: spec, i: i, n: n, perYear: f.per, freqLabel: f.label, accelBase: base,
      payment: payment, termPayments: termPayments, rows: rows,
      interest: cents(interestTerm), principal: cents(principalTerm), total: cents(paidTerm),
      balance: rows.length ? rows[rows.length - 1].balance : spec.balance,
      payoff: payoffMonths, yearly: cents((payment + extra) * f.per)
    };
  }
  // Highest annual rate (to 0.01%) at which the plan's payment stays at or under the target.
  function rateNeeded(spec, target) {
    const pay = (r) => plan(Object.assign({}, spec, { rate: r, term: 1 })).payment;
    if (pay(0) > target) return null;
    let lo = 0, hi = 50;
    if (pay(hi) <= target) return hi;
    for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (pay(mid) <= target) lo = mid; else hi = mid; }
    return Math.floor(lo * 100 + 1e-9) / 100;
  }
  // Shortest amortization, in whole months up to 50 years, whose payment fits the target.
  function amortizationNeeded(spec, target) {
    for (let m = 1; m <= 600; m++) if (plan(Object.assign({}, spec, { amortization: m, term: 1 })).payment <= target) return m;
    return null;
  }
  function money(x) {
    const neg = x < 0 ? "-" : "";
    const [w, d] = Math.abs(cents(x)).toFixed(2).split(".");
    return neg + "$" + w.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + d;
  }
  function pct(x) { return (Math.round(x * 1000) / 1000).toString() + "%"; }
  function dur(m) {
    if (!Number.isFinite(m)) return "never at this payment";
    const y = Math.floor(m / 12), r = m % 12, out = [];
    if (y) out.push(y + (y === 1 ? " year" : " years"));
    if (r || !y) out.push(r + (r === 1 ? " month" : " months"));
    return out.join(" ");
  }
  function num(x) { return String(Math.round(x * 10000) / 10000); }
  function show(t, v) {
    if (v === null) return t === "percent" ? "no rate fits" : "no length up to 50 years fits";
    if (t === "money") return money(v);
    if (t === "percent") return pct(v);
    if (t === "duration") return dur(v);
    if (t === "bool") return v ? "yes" : "no";
    if (t === "number") return num(v);
    return String(v);
  }
  const METRIC = {
    payment: ["money", (p) => p.payment], interest: ["money", (p) => p.interest], principal: ["money", (p) => p.principal],
    balance: ["money", (p) => p.balance], total: ["money", (p) => p.total], yearly: ["money", (p) => p.yearly],
    rate: ["percent", (p) => p.spec.rate], payoff: ["duration", (p) => p.payoff],
    "three months interest": ["money", (p) => cents(p.balance * (p.spec.rate / 100) * 3 / 12)]
  };
  const HEAD = { payment: "Payment", interest: "Interest in term", principal: "Principal in term", balance: "Balance at term end",
    total: "Paid in term", yearly: "Paid per year", rate: "Rate", payoff: "Time to pay off", "three months interest": "Three months interest" };
  function metric(p, m) { return METRIC[m][1](p); }
  // Report blocks, so the CLI, the tests and the playground all render the same results.
  function compareBlock(plans, metrics) {
    const cols = ["Plan"].concat(metrics.map((m) => HEAD[m]));
    const rows = plans.map((p) => [p.name].concat(metrics.map((m) => {
      const v = show(METRIC[m][0], metric(p, m));
      return m === "payment" ? v + " " + p.freqLabel : v;
    })));
    return { kind: "table", title: "Compare", columns: cols, rows: rows };
  }
  function scheduleBlock(p, first) {
    const rows = p.rows.slice(0, first || p.rows.length).map((r) => [String(r.n), money(r.payment), money(r.interest), money(r.principal + r.lump), money(r.balance)]);
    return { kind: "table", title: "Schedule for " + p.name + " (" + p.freqLabel + ", first " + rows.length + " of " + p.termPayments + " in term)", columns: ["#", "Paid", "Interest", "Principal", "Balance"], rows: rows };
  }
  function yearlyBlock(p) {
    const rows = [];
    for (let y = 0; y * p.perYear < p.rows.length; y++) {
      const part = p.rows.slice(y * p.perYear, (y + 1) * p.perYear);
      const s = (k) => cents(part.reduce((a, r) => a + r[k], 0));
      rows.push(["Year " + (y + 1), money(s("payment") + s("lump")), money(s("interest")), money(s("principal") + s("lump")), money(part[part.length - 1].balance)]);
    }
    return { kind: "table", title: "Year by year for " + p.name, columns: ["Year", "Paid", "Interest", "Principal", "Balance at year end"], rows: rows };
  }
  function explainBlock(p) {
    const s = p.spec, c = COMPOUND[s.compounded], f = FREQ[s.payments];
    const lines = [
      "Rate " + pct(s.rate) + " a year, compounded " + s.compounded + ", paid " + f.label + " (" + f.per + " times a year).",
      "Rate per payment: i = (1 + " + num(s.rate / 100) + " / " + c + ") ^ (" + c + " / " + f.per + ") - 1 = " + p.i.toFixed(8)
    ];
    if (f.accel) {
      lines.push("Accelerated: first the monthly payment over " + dur(s.amortization) + " = " + money(p.accelBase) + ", then divided by " + f.accel + " = " + money(p.payment) + ".");
    } else {
      lines.push("Payments to clear it: n = " + num(s.amortization / 12) + " years x " + f.per + " = " + p.n + ".");
      lines.push("Payment = L x i / (1 - (1 + i) ^ -n) = " + money(s.balance) + " x " + p.i.toFixed(8) + " / (1 - " + (1 + p.i).toFixed(8) + " ^ -" + p.n + ") = " + money(p.payment) + ".");
    }
    if (s.extra) lines.push("Plus " + money(s.extra) + " extra with every payment.");
    if (s.lump) lines.push("Plus a " + money(s.lump) + " lump sum after every " + f.per + " payments.");
    lines.push("Each payment: interest = balance x i, rounded to the cent. The rest of the payment reduces the balance.");
    lines.push("Over a term of " + dur(s.term) + " (" + p.termPayments + " payments): interest " + money(p.interest) + ", principal " + money(p.principal) + ", balance left " + money(p.balance) + ".");
    return { kind: "explain", title: "How " + p.name + " is worked out", lines: lines };
  }
  function pad(s, w) { s = String(s); return s + " ".repeat(Math.max(0, w - s.length)); }
  function renderText(blocks) {
    const NL = String.fromCharCode(10), out = [];
    for (const b of blocks) {
      if (b.kind === "table") {
        const w = b.columns.map((c, j) => Math.max(c.length, ...b.rows.map((r) => String(r[j]).length)));
        out.push(b.title);
        out.push(b.columns.map((c, j) => pad(c, w[j])).join("  ").trimEnd());
        out.push(w.map((x) => "=".repeat(x)).join("  "));
        for (const r of b.rows) out.push(r.map((c, j) => pad(c, w[j])).join("  ").trimEnd());
      } else if (b.kind === "explain") {
        out.push(b.title); for (const l of b.lines) out.push("  " + l);
      } else if (b.kind === "check") {
        out.push((b.pass ? "PASS  " : "FAIL  ") + b.text);
      } else { out.push(b.text); }
      out.push("");
    }
    return out.join(NL);
  }
  return { rateNeeded, amortizationNeeded, FREQ, COMPOUND, METRIC, HEAD, cents, periodicRate, annuity, plan, metric, show, money, pct, dur, compareBlock, scheduleBlock, yearlyBlock, explainBlock, renderText };
}
if (typeof module !== "undefined" && module.exports) module.exports = renewKernel;
