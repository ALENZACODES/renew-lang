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
  // Rate changes as payment counts from the start. A rate path inside the term ("rate 5.2% then 4.7% after
  // 12 months") and a renewal path ("renews at 4.5% then 5% after 1 year") use one rule: each "after" counts
  // from when the previous rate started. At every change the payment is worked out again on the balance left
  // over the rest of the amortization, like an adjustable payment mortgage or a renewal.
  function rateChanges(spec, per) {
    const out = [];
    let at = 0;
    for (const st of spec.ratePath || []) { at += st.after; out.push({ months: at, rate: st.rate, renewal: false }); }
    if (typeof spec.renews === "number") {
      let r = spec.term; out.push({ months: r, rate: spec.renews, renewal: true });
      for (const st of spec.renewPath || []) { r += st.after; out.push({ months: r, rate: st.rate, renewal: true }); }
    }
    return out.map((c) => Object.assign(c, { k: Math.round((c.months / 12) * per) }));
  }
  function pathText(first, steps) {
    return [pct(first)].concat((steps || []).map((st) => pct(st.rate) + " after " + dur(st.after))).join(", then ");
  }
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
    const firstPayment = payment;
    const extra = spec.extra || 0, lump = spec.lump || 0;
    const rows = [], all = [];
    const changes = rateChanges(spec, f.per), applied = [];
    let renewPayment = null;
    let bal = spec.balance, k = 0, interestTerm = 0, principalTerm = 0, paidTerm = 0, ik = i;
    while (bal > 0.004 && k < 100 * f.per) {
      // A rate change: the payment is worked out again on the balance left over the rest of the amortization.
      for (const ch of changes) {
        if (ch.k !== k || k >= n) continue;
        ik = periodicRate(ch.rate, c, f.per);
        const restMonths = spec.amortization - ch.months;
        if (f.accel) payment = cents(annuity(bal, periodicRate(ch.rate, c, 12), restMonths) / f.accel);
        else payment = cents(annuity(bal, ik, n - k));
        applied.push({ months: ch.months, rate: ch.rate, renewal: ch.renewal, payment: payment, balance: bal });
        if (ch.renewal && renewPayment === null) renewPayment = payment;
      }
      k++;
      const interest = cents(bal * ik);
      let pay = payment + extra;
      if (k >= n || pay - interest >= bal) pay = cents(bal + interest); // the last payment absorbs rounding
      let principal = cents(pay - interest);
      let lumpHere = 0;
      bal = cents(bal - principal);
      if (lump > 0 && k % f.per === 0 && bal > 0) { lumpHere = Math.min(lump, bal); bal = cents(bal - lumpHere); }
      const row = { n: k, payment: pay, interest: interest, principal: principal, lump: lumpHere, balance: bal };
      all.push(row);
      if (k <= termPayments) {
        interestTerm += interest; principalTerm += principal + lumpHere; paidTerm += pay + lumpHere;
        rows.push(row);
      }
      if (pay <= interest) { k = Infinity; break; }
    }
    const payoffMonths = Number.isFinite(k) ? Math.ceil((k / f.per) * 12 - 1e-9) : Infinity;
    return {
      name: spec.name, spec: spec, i: i, n: n, perYear: f.per, freqLabel: f.label, accelBase: base,
      payment: firstPayment, renewPayment: renewPayment, changes: applied,
      // the payment in force when the term ends, after any rate path changes inside the term
      termEndPayment: applied.filter((x) => !x.renewal).reduce((a, x) => x.payment, firstPayment), termPayments: termPayments, rows: rows, all: all,
      interest: cents(interestTerm), principal: cents(principalTerm), paid: cents(paidTerm),
      balance: rows.length ? rows[rows.length - 1].balance : spec.balance,
      payoff: payoffMonths, yearly: cents((firstPayment + extra) * f.per)
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
    // A difference between two rates is in percentage points, not a percentage of anything.
    if (t === "points") { const r = Math.round(v * 1000) / 1000; return r + (Math.abs(r) === 1 ? " percentage point" : " percentage points"); }
    if (t === "money") return money(v);
    if (t === "percent") return pct(v);
    if (t === "duration") return dur(v);
    if (t === "bool") return v ? "yes" : "no";
    if (t === "number") return num(v);
    return String(v);
  }
  const METRIC = {
    payment: ["money", (p) => p.payment], interest: ["money", (p) => p.interest], principal: ["money", (p) => p.principal],
    balance: ["money", (p) => p.balance], paid: ["money", (p) => p.paid], yearly: ["money", (p) => p.yearly],
    // The regular payment after the term: worked out again at the renews at rate, the same payment when the
    // rate is assumed to stay, and $0.00 when the loan is paid off within the term.
    "renewal payment": ["money", (p) => (p.termPayments >= p.n || p.payoff <= p.spec.term ? 0 : p.renewPayment !== null ? p.renewPayment : (p.termEndPayment || p.payment))],
    rate: ["percent", (p) => p.spec.rate], payoff: ["duration", (p) => p.payoff],
    "three months interest": ["money", (p) => cents(p.balance * (p.spec.rate / 100) * 3 / 12)]
  };
  const HEAD = { payment: "Payment", interest: "Interest in term", principal: "Principal in term", balance: "Balance at term end",
    paid: "Paid in term", yearly: "Paid per year", rate: "Rate", payoff: "Time to pay off", "three months interest": "Three months interest",
    "renewal payment": "Payment after term" };
  function metric(p, m) { return METRIC[m][1](p); }
  // The same plan seen over a fixed number of months instead of its own term. Past the term the plan
  // keeps its rate, or uses its renews at rate, so every plan in a comparison covers the same months.
  const HORIZON = { interest: 1, principal: 1, paid: 1, balance: 1 };
  function over(p, months) {
    const k = Math.round((months / 12) * p.perYear), part = p.all.slice(0, k);
    const sum = (f) => cents(part.reduce((a, r) => a + f(r), 0));
    return {
      interest: sum((r) => r.interest), principal: sum((r) => r.principal + r.lump), paid: sum((r) => r.payment + r.lump),
      balance: part.length ? (part.length < k ? 0 : part[part.length - 1].balance) : p.spec.balance
    };
  }
  function rateInTermEnd(s) { const path = s.ratePath || []; return path.length ? path[path.length - 1].rate : s.rate; }
  function rateAfterTerm(p) { return typeof p.spec.renews === "number" ? p.spec.renews : rateInTermEnd(p.spec); }
  function renewText(s) { return (s.renewPath || []).length ? pathText(s.renews, s.renewPath) : pct(s.renews); }
  function validHorizon(months) {
    if (!(Number.isInteger(months) && months >= 1 && months <= 600)) throw new Error("A comparison horizon must be between 1 month and 50 years.");
  }
  // Report blocks, so the CLI, the tests and the playground all render the same results.
  // Notes for plans marked variable, shared by tables and single values.
  function variableNotes(plans) {
    return plans.filter((p) => p.spec.rateKind === "variable").map((p) => (p.spec.ratePath || []).length
      ? "Variable rate: " + JSON.stringify(p.name) + " follows the rate path written in the program, " + pathText(p.spec.rate, p.spec.ratePath) + ", and the payment is worked out again at each change. A real variable rate can change at any time, so this is one path, not a forecast."
      : "Variable rate: " + JSON.stringify(p.name) + " is marked variable, but Renew holds its rate at " + pct(p.spec.rate) + " for the whole term. A variable rate can change at any time, so these figures for it are not a forecast. Write a rate path, like rate " + pct(p.spec.rate) + " then " + pct(Math.max(0, Math.round((p.spec.rate - 0.5) * 100) / 100)) + " after 12 months, or use a sweep of rate to see the range.");
  }
  function valueBlock(text, plans) { return { kind: "value", text: text, notes: variableNotes(plans) }; }
  function compareBlock(plans, metrics, horizon) {
    if (horizon !== undefined && horizon !== null) validHorizon(horizon);
    const H = horizon || 0;
    // When a plan resets its payment after the term, show that payment next to the first one.
    if (metrics.includes("payment") && !metrics.includes("renewal payment") && plans.some((p) => p.renewPayment !== null && p.renewPayment !== undefined)) {
      metrics = metrics.slice(); metrics.splice(metrics.indexOf("payment") + 1, 0, "renewal payment");
    }
    const OVERHEAD = { interest: "Interest over ", principal: "Principal over ", paid: "Paid over ", balance: "Balance after " };
    const both = metrics.includes("payment") && metrics.includes("renewal payment");
    const cols = ["Plan"].concat(metrics.map((m) => H && HORIZON[m] ? OVERHEAD[m] + dur(H) : m === "payment" && both ? "Payment in term" : HEAD[m]));
    const rows = plans.map((p) => {
      const o = H ? over(p, H) : null;
      return [p.name].concat(metrics.map((m) => {
        const v = o && HORIZON[m] ? show("money", o[m]) : show(METRIC[m][0], metric(p, m));
        return m === "payment" || (m === "renewal payment" && metric(p, m) > 0) ? v + " " + p.freqLabel : v;
      }));
    });
    const notes = [];
    const terms = [...new Set(plans.map((p) => p.spec.term))];
    if (H) {
      for (const p of plans) {
        if (p.spec.term < H && p.payoff > p.spec.term) notes.push(JSON.stringify(p.name) + " has a " + dur(p.spec.term) + " term, so the rest of the " + dur(H) + " assumes it renews at " + (typeof p.spec.renews === "number" ? renewText(p.spec) + " (its renews at setting)." : pct(rateAfterTerm(p)) + ", its current rate. Add renews at to test another rate."));
        if (p.spec.term > H) notes.push(JSON.stringify(p.name) + " has a " + dur(p.spec.term) + " term, so the " + dur(H) + " horizon ends inside it.");
      }
    } else if (terms.length > 1 && metrics.some((m) => HORIZON[m])) {
      notes.push("These plans have different terms (" + terms.map(dur).join(", ") + "). Interest, principal, paid and balance cover each plan's own term, so they are not like for like. Add over " + dur(Math.max.apply(null, terms)) + " to the compare line to put every plan on the same horizon.");
    }
    if (metrics.includes("payoff")) notes.push("Time to pay off assumes each rate holds to the end of the amortization, except where renews at sets the rate after the term. Future rates are unknown, and a sweep shows how much they matter.");
    if (H && metrics.includes("interest") && (metrics.includes("balance") || metrics.includes("paid")) && new Set(plans.map((p) => p.spec.balance)).size === 1 && plans.length > 1) notes.push("Interest over " + dur(H) + " already counts the different balances left: for each plan, paid plus balance left equals the starting balance plus interest. So the row with less interest has the lower total of money paid and still owed. It does not count when the money is paid.");
    const bases = [...new Set(plans.map((p) => p.spec.rateBasis || "typed"))];
    if (bases.length > 1) notes.push("Some rates here are posted Bank of Canada benchmarks (" + plans.filter((p) => p.spec.rateBasis === "posted").map((p) => JSON.stringify(p.name)).join(", ") + ") and some are typed in. Posted rates are usually higher than the rates lenders offer, so compare posted with posted and offered with offered.");
    for (const n of variableNotes(plans)) notes.push(n);
    return { kind: "table", title: H ? "Compare over " + dur(H) : "Compare", columns: cols, rows: rows, notes: notes };
  }
  // Settings a plan must satisfy. The interpreter and compiled programs use the same rules.
  function specProblem(s) {
    if (!(s.balance > 0)) return "The balance must be more than $0.";
    if (!(s.rate >= 0 && s.rate < 100)) return "The rate must be between 0% and 100%.";
    if (!(s.amortization >= 1 && s.amortization <= 600)) return "The amortization must be between 1 month and 50 years.";
    if (!(s.term >= 1 && s.term <= s.amortization)) return "The term must be at least 1 month and no longer than the amortization.";
    if (s.extra < 0 || s.lump < 0) return "Extra payments cannot be negative.";
    if (typeof s.renews === "number" && !(s.renews >= 0 && s.renews < 100)) return "The renews at rate must be between 0% and 100%.";
    return pathProblem(s);
  }
  // Rate paths: every step is at least a month after the one before, inside the term for a rate path and
  // inside the amortization for a renewal path.
  function pathProblem(s) {
    const steps = s.ratePath || [], again = s.renewPath || [];
    for (const st of steps.concat(again)) {
      if (!(st.rate >= 0 && st.rate < 100)) return "Every rate in a rate path must be between 0% and 100%.";
      if (!(Number.isInteger(st.after) && st.after >= 1)) return "Each step in a rate path must come at least 1 month after the one before.";
    }
    const inTerm = steps.reduce((a, st) => a + st.after, 0);
    if (steps.length && inTerm >= s.term) return "The rate path reaches " + dur(inTerm) + ", which is not inside the term of " + dur(s.term) + ". Changes after the term belong in renews at.";
    if (steps.length && s.rateKind === "fixed") return "A fixed rate does not change inside the term. Mark it variable, or move the change to renews at.";
    if (again.length && typeof s.renews !== "number") return "A renewal path needs renews at first.";
    const after = s.term + again.reduce((a, st) => a + st.after, 0);
    if (again.length && after >= s.amortization) return "The renewal path reaches " + dur(after) + ", which is past the amortization of " + dur(s.amortization) + ". The last rate already holds to the end.";
    return null;
  }
  // The renewal rate at which a plan's interest (or everything paid) over a horizon matches another plan.
  // Rates are tried to the thousandth of a percent; the answer is the lowest rate at which the plan no longer
  // costs less, so the two neighbouring rates can be shown either side of it.
  function breakEven(spec, ref, measure, horizon) {
    validHorizon(horizon);
    const target = over(ref, horizon)[measure];
    const val = (t) => over(plan(Object.assign({}, spec, { renews: t / 1000 })), horizon)[measure];
    let lo = 0, hi = 30000;
    if (val(lo) >= target) return { rate: null, reason: "low", target: target };
    if (val(hi) < target) return { rate: null, reason: "high", target: target };
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (val(mid) >= target) hi = mid; else lo = mid; }
    return { rate: hi / 1000, below: lo / 1000, valueBelow: val(lo), valueAt: val(hi), target: target };
  }
  function breakEvenNote(r, name, refName, measure, horizon) {
    const what = (measure === "paid" ? "everything paid" : measure) + " over " + dur(horizon);
    if (r.rate === null) return r.reason === "low"
      ? "Even renewing at 0%, " + JSON.stringify(name) + " has " + what + " of at least " + money(r.target) + ", the figure for " + JSON.stringify(refName) + ", so no renewal rate makes it cost less."
      : "Even renewing at 30%, " + JSON.stringify(name) + " has less " + what + " than " + JSON.stringify(refName) + " (" + money(r.target) + "), so it costs less at any renewal rate Renew tries.";
    return "Renewing at " + pct(r.below) + ", " + JSON.stringify(name) + " has " + what + " of " + money(r.valueBelow) + ", less than " + JSON.stringify(refName) + " at " + money(r.target) + ". Renewing at " + pct(r.rate) + " it has " + money(r.valueAt) + ", which is not less. Rates are tried to a thousandth of a percent, and amounts are rounded to the cent, so this is the exact crossing for this model, not a forecast.";
  }
  // amortization to fit $X: the shortest amortization, in whole months, whose payment is at or under $X.
  function fitAmortization(spec, target) { return amortizationNeeded(spec, target); }
  // Inputs for compiled programs: a number in the declared unit, or text written the Renew way.
  function inputValue(name, type, raw) {
    const ex = { money: "$3,000", percent: "1.5%", duration: "20 years", number: "12" }[type];
    const bad = () => { throw new Error("Input " + name + " must be " + { money: "an amount of money", percent: "a percentage", duration: "a length of time", number: "a plain number" }[type] + ", like " + ex + ". Got " + JSON.stringify(raw) + "."); };
    if (typeof raw === "number") { if (!Number.isFinite(raw)) bad(); return raw; }
    if (typeof raw !== "string") bad();
    const t = raw.trim(), n = (x) => Number(x.replace(/,/g, ""));
    let m;
    if (type === "money" && (m = /^\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)$/.exec(t))) return n(m[1]);
    if (type === "percent" && (m = /^(-?\d+(?:\.\d+)?)\s*%$/.exec(t))) return n(m[1]);
    if (type === "number" && (m = /^(-?\d+(?:\.\d+)?)$/.exec(t))) return n(m[1]);
    if (type === "duration" && (m = /^(\d+)\s*(years?|months?)(?:\s+(\d+)\s*months?)?$/.exec(t))) return (/^y/.test(m[2]) ? n(m[1]) * 12 : n(m[1])) + (m[3] ? n(m[3]) : 0);
    return bad();
  }
  // sweep: one row per value of a single setting, everything else held as the plan states it.
  function sweepBlock(spec, prop, type, from, to, step, metrics, horizon, line, ref) {
    const bad = (m) => { throw new Error("Line " + line + ": " + m); };
    if (!(step > 0)) bad("The step in a sweep must be more than zero.");
    if (to < from) bad("A sweep must go from the smaller value to the larger one.");
    const count = Math.floor((to - from) / step + 1e-9) + 1;
    if (count > 60) bad("This sweep would make " + count + " rows. Keep it to 60 or fewer by using a larger step.");
    const plans = [];
    for (let k = 0; k < count; k++) {
      const v = Math.round((from + k * step) * 1e9) / 1e9;
      const s = Object.assign({}, spec, { name: show(type, v) });
      s[prop] = v;
      if (prop === "rate") s.rateBasis = "typed";
      const problem = specProblem(s);
      if (problem) bad("At " + prop + " " + show(type, v) + ": " + problem);
      plans.push(plan(s));
    }
    const b = compareBlock(ref ? plans.concat([ref]) : plans, metrics, horizon);
    if (ref) b.rows[b.rows.length - 1][0] = ref.name + " (for comparison)";
    b.title = "Sweep " + prop + " for " + JSON.stringify(spec.name) + (horizon ? " over " + dur(horizon) : "") + (ref ? ", against " + JSON.stringify(ref.name) : "");
    b.columns[0] = prop.charAt(0).toUpperCase() + prop.slice(1);
    b.notes = b.notes.filter((n) => !n.startsWith("These plans have different terms"));
    b.notes = b.notes.filter((n) => !n.startsWith("Variable rate:"));
    if (spec.rateKind === "variable") b.notes.push(prop === "rate" ? "Variable rate: " + JSON.stringify(spec.name) + " is marked variable. Each row holds one rate for the whole term; a variable rate can move inside the term, so read the rows as a range, not a forecast." : variableNotes([{ name: spec.name, spec: spec }])[0]);
    if (ref) for (const n of variableNotes([ref])) b.notes.push(n);
    if (prop === "renews" && b.columns.includes("Payment after term")) b.notes.unshift("Payment in term is the same in every row because the term rate does not change. Payment after term is the payment once it renews at the rate in the first column.");
    if (prop !== "term") {
      b.notes = b.notes.filter((n) => n.charAt(0) !== '"' || (ref && n.startsWith(JSON.stringify(ref.name))));
      if (horizon && spec.term < horizon) b.notes.unshift("Every row has a " + dur(spec.term) + " term, so the rest of the " + dur(horizon) + " uses " + (prop === "renews" ? "the renews at rate in the first column." : typeof spec.renews === "number" ? "its renews at rate, " + pct(spec.renews) + "." : "the same rate as the term. Add renews at to test another rate."));
      if (horizon && spec.term > horizon) b.notes.unshift("Every row has a " + dur(spec.term) + " term, so the " + dur(horizon) + " horizon ends inside it.");
    }
    return b;
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
    if (s.rateKind === "variable" && !(s.ratePath || []).length) lines.push("The rate is marked variable. That is a label: Renew works out this plan as if the rate stays at " + pct(s.rate) + " for the term. Write a rate path, or use a sweep or renews at, to test other rates.");
    const firstRenewal = (p.changes || []).find((x) => x.renewal);
    for (const ch of p.changes || []) lines.push(ch === firstRenewal
      ? "After the term it renews at " + pct(ch.rate) + " over the remaining " + dur(s.amortization - ch.months) + ", so the payment becomes " + money(ch.payment) + "."
      : (ch.renewal ? "Renewal path" : "Rate path") + ", " + dur(ch.months) + " from the start: the rate becomes " + pct(ch.rate) + ". On the balance left, " + money(ch.balance) + ", over the remaining " + dur(s.amortization - ch.months) + ", the payment becomes " + money(ch.payment) + ".");
    lines.push("Time to pay off: " + dur(p.payoff) + ", assuming " + (typeof s.renews === "number" ? ((s.renewPath || []).length ? "it renews at " + renewText(s) + " after this term, and the last rate holds after that" : "the rate is " + renewText(s) + " after this term") : "the rate stays at " + pct(rateInTermEnd(s)) + " after this term") + ". That is an assumption, not a forecast.");
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
        for (const n of b.notes || []) out.push("Note: " + n);
      } else if (b.kind === "value") {
        out.push(b.text); for (const n of b.notes || []) out.push("Note: " + n);
      } else if (b.kind === "explain") {
        out.push(b.title); for (const l of b.lines) out.push("  " + l);
      } else if (b.kind === "check") {
        out.push((b.pass ? "PASS  " : "FAIL  ") + b.text);
      } else { out.push(b.text); }
      out.push("");
    }
    return out.join(NL);
  }
  return { rateChanges, pathText, renewText, rateInTermEnd, pathProblem, breakEven, breakEvenNote, fitAmortization, inputValue, variableNotes, valueBlock, over, specProblem, sweepBlock, validHorizon, rateNeeded, amortizationNeeded, FREQ, COMPOUND, METRIC, HEAD, cents, periodicRate, annuity, plan, metric, show, money, pct, dur, compareBlock, scheduleBlock, yearlyBlock, explainBlock, renderText };
}
if (typeof module !== "undefined" && module.exports) module.exports = renewKernel;
