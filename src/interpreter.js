// Interpreter for the Renew language. John Khan, Toronto, Ontario.
(function (root) {
  "use strict";
  function renewInterpreter(C, K, parse, check) {
    const { RenewError, suggest } = C;
  function exprText(e) {
    switch (e.e) {
      case "lit": return K.show(e.t, e.v);
      case "posted": return "posted " + e.years + " year on " + e.date;
      case "var": return e.name;
      case "metric": return e.m + " of " + JSON.stringify(e.plan);
      case "solve": return e.what + " needed for " + JSON.stringify(e.plan) + " at " + exprText(e.target);
      case "breakeven": return "break even " + e.prop + " for " + JSON.stringify(e.plan) + " against " + JSON.stringify(e.ref) + " by " + e.m + " over " + exprText(e.over);
      case "neg": return "-" + exprText(e.a);
      case "call": return e.f + "(" + exprText(e.a) + ", " + exprText(e.b) + ")";
      case "bin": return exprText(e.a) + " " + e.op + " " + exprText(e.b);
      case "cmp": return exprText(e.a) + " " + e.op + " " + exprText(e.b);
    }
  }
  function plansIn(e, acc) {
    acc = acc || [];
    if (!e || typeof e !== "object") return acc;
    if ((e.e === "metric" || e.e === "solve" || e.e === "breakeven") && !acc.includes(e.plan)) acc.push(e.plan);
    if (e.e === "breakeven" && !acc.includes(e.ref)) acc.push(e.ref);
    for (const k of ["a", "b", "target"]) if (e[k]) plansIn(e[k], acc);
    return acc;
  }
  function evalExpr(e, env) {
    switch (e.e) {
      case "lit": return e.v;
      case "posted": return e.found.v;
      case "var": return env.vars.get(e.name);
      case "metric": return K.metric(env.plan(e.plan), e.m);
      case "solve": return K[e.what === "rate" ? "rateNeeded" : "amortizationNeeded"](env.plan(e.plan).spec, evalExpr(e.target, env));
      case "breakeven": return breakEvenOf(e, env).value;
      case "neg": return -evalExpr(e.a, env);
      case "call": return Math[e.f](evalExpr(e.a, env), evalExpr(e.b, env));
      case "bin": {
        const a = evalExpr(e.a, env), b = evalExpr(e.b, env);
        if (e.op === "+") return a + b;
        if (e.op === "-") return a - b;
        if (e.op === "*") return a * b * (percentScale(e) ? 0.01 : 1);
        if (b === 0) throw new RenewError("This divides by zero.", e.line, e.col);
        return a / b;
      }
      case "cmp": {
        const a = evalExpr(e.a, env), b = evalExpr(e.b, env);
        const r = e.ct === "money" ? [K.cents(a), K.cents(b)] : [a, b];
        return { "<": r[0] < r[1], ">": r[0] > r[1], "<=": r[0] <= r[1], ">=": r[0] >= r[1], "==": r[0] === r[1], "!=": r[0] !== r[1] }[e.op];
      }
    }
  }
  function typeOfLit(e) { return e.ty; }
  function breakEvenOf(e, env) {
    const h = evalExpr(e.over, env), spec = env.plan(e.plan).spec;
    if (e.prop === "renews" && !(spec.term < h)) throw new RenewError("break even needs a horizon longer than the term of " + JSON.stringify(e.plan) + " (" + K.dur(spec.term) + "), or the renewal rate makes no difference inside it.", e.over.line, e.over.col, "For example: over 5 years for a 1 year term.");
    try { return K.breakEvenSetting(spec, env.plan(e.ref), e.prop, e.m, h); } catch (err) { throw new RenewError(err.message, e.over.line, e.over.col); }
  }
  // Money times a percentage is money: $400,000 * 1% is $4,000, so the percentage is scaled by 0.01.
  function percentScale(e) { const a = e.a.ty, b = e.b.ty; return e.op === "*" && ((a === "money" && b === "percent") || (a === "percent" && b === "money")); }

  function resolveSpec(st, specs, env) {
    const base = st.base ? specs.get(st.base) : { compounded: "semi-annually", payments: "monthly", extra: 0, lump: 0 };
    const spec = Object.assign({}, base, { name: st.name, kind: st.s });
    if (st.props.some((pr) => pr.prop === "amortization")) delete spec.fitted;
    for (const pr of st.props) {
      if (pr.fit || pr.remainingFrom !== undefined) continue;
      spec[pr.prop] = pr.expr ? evalExpr(pr.expr, env) : pr.value;
      if (pr.prop === "rate") { spec.ratePath = (pr.path || []).map((x) => ({ rate: evalExpr(x.rate, env), after: evalExpr(x.after, env) })); spec.paymentHeld = !!pr.paymentHeld; }
      if (pr.prop === "renews") spec.renewPath = (pr.path || []).map((x) => ({ rate: evalExpr(x.rate, env), after: evalExpr(x.after, env) }));
    }
    for (const pr of st.props) if (pr.remainingFrom !== undefined) {
      const from = specs.get(pr.remainingFrom);
      spec.amortization = from.amortization - from.term;
      if (spec.amortization < 1) throw new RenewError(JSON.stringify(pr.remainingFrom) + " has no amortization left after its term.", pr.line, pr.rcol);
    }
    for (const pr of st.props) if (pr.fit) {
      const target = evalExpr(pr.fit, env), m = K.fitAmortization(spec, target);
      if (m === null) throw new RenewError("No amortization up to 50 years brings the payment of " + JSON.stringify(st.name) + " to " + K.money(target) + " or less.", pr.line, pr.fit.col, "Lower the balance or the rate, or aim for a higher payment.");
      spec.amortization = m; spec.fitted = { months: m, target: target, plan: st.name };
    }
    for (const pr of st.props) if (pr.prop === "rate" && pr.kind) spec.rateKind = pr.kind;
    for (const pr of st.props) if (pr.prop === "rate") spec.rateBasis = pr.expr.e === "posted" ? "posted" : "typed";
    validateSpec(spec, st);
    return spec;
  }
  function validateSpec(s, st) {
    const bad = (m) => { throw new RenewError(m, st.line, st.col); };
    if (!(s.balance > 0)) bad("The balance for " + JSON.stringify(s.name) + " must be more than $0.");
    if (!(s.rate >= 0 && s.rate < 100)) bad("The rate for " + JSON.stringify(s.name) + " must be between 0% and 100%.");
    if (!(s.amortization >= 1 && s.amortization <= 600)) bad("The amortization for " + JSON.stringify(s.name) + " must be between 1 month and 50 years.");
    if (!(s.term >= 1 && s.term <= s.amortization)) bad("The term for " + JSON.stringify(s.name) + " must be at least 1 month and no longer than the amortization.");
    if (s.extra < 0 || s.lump < 0) bad("Extra payments cannot be negative.");
    if (typeof s.renews === "number" && !(s.renews >= 0 && s.renews < 100)) bad("The renews at rate for " + JSON.stringify(s.name) + " must be between 0% and 100%.");
    if (st.rateMustChange) { const sp = K.sameRateProblem(s); if (sp) throw new RenewError(sp, st.rateMustChange.line, st.rateMustChange.col); }
    const pp = K.pathProblem(s);
    if (pp) {
      const pr = st.props.find((x) => (x.prop === "rate" || x.prop === "renews") && (x.path || []).length) || st;
      throw new RenewError(pp.replace(/^The /, "The ").replace(/^/, JSON.stringify(s.name) + ": "), pr.line, pr.col);
    }
  }

  // Inputs: values a caller can change without editing the program. Text is read the Renew way and must have
  // the declared unit: an input declared as 1.5% refuses "1.5" and "$1.50".
  function inputOverride(st, raw) {
    try { return K.inputValue(st.name, st.expr.ty, raw); } catch (err) { throw new RenewError(err.message, st.line, st.col); }
  }
  function inputsOf(src) {
    return check(parse(src)).filter((st) => st.s === "input").map((st) => ({ name: st.name, type: st.expr.ty, text: exprText(st.expr), line: st.line }));
  }
  function run(src, opts) {
    const given = (opts && opts.inputs) || {};
    const prog = check(parse(src));
    for (const k of Object.keys(given)) if (!prog.some((st) => st.s === "input" && st.name === k)) throw new RenewError("This program has no input named " + JSON.stringify(k) + ".", 1, 1, suggest(k, prog.filter((st) => st.s === "input").map((st) => st.name)));
    const specs = new Map(), cache = new Map(), blocks = [];
    const where = new Map();
    for (const st of prog) if (st.s === "mortgage" || st.s === "scenario") where.set(st.name, st);
    const planOf = (n) => { try { return K.plan(specs.get(n)); } catch (err) { if (err.planError) throw new RenewError(err.message, where.get(n).line, where.get(n).col); throw err; } };
    const env = { vars: new Map(), plan: (n) => { if (!cache.has(n)) cache.set(n, planOf(n)); return cache.get(n); } };
    for (const st of prog) {
      if (st.s === "mortgage" || st.s === "scenario") specs.set(st.name, resolveSpec(st, specs, env));
      else if (st.s === "let") env.vars.set(st.name, evalExpr(st.expr, env));
      else if (st.s === "input") env.vars.set(st.name, Object.prototype.hasOwnProperty.call(given, st.name) ? inputOverride(st, given[st.name]) : evalExpr(st.expr, env));
      else if (st.s === "compare") blocks.push(K.compareBlock(st.planNames.map(env.plan), st.metricList, st.over ? evalExpr(st.over, env) : null));
      else if (st.s === "sweep") { try { blocks.push(K.sweepBlock(env.plan(st.plan).spec, st.prop, st.ptype, evalExpr(st.from, env), evalExpr(st.to, env), evalExpr(st.step, env), st.metricList, st.over ? evalExpr(st.over, env) : null, st.line, st.against !== undefined ? env.plan(st.against) : null)); } catch (err) { const m = /^Line (\d+): ([\s\S]*)$/.exec(err.message || ""); if (m && !(err instanceof RenewError)) throw new RenewError(m[2], st.line, st.col); throw err; } }
      else if (st.s === "show" && st.what === "schedule") blocks.push(K.scheduleBlock(env.plan(st.plan), st.first));
      else if (st.s === "show" && st.what === "yearly") blocks.push(K.yearlyBlock(env.plan(st.plan)));
      else if (st.s === "show" && st.expr.e === "breakeven") {
        const r = breakEvenOf(st.expr, env), h = evalExpr(st.expr.over, env), b = K.valueBlock(exprText(st.expr) + " = " + K.breakEvenText(r), plansIn(st.expr).map(env.plan), r.value, r.type);
        b.notes.unshift(K.breakEvenNote(r, st.expr.plan, st.expr.ref, st.expr.m, h));
        if (st.expr.m === "paid") b.notes.splice(1, 0, K.paidNote(h));
        blocks.push(b);
      }
      else if (st.s === "show") { const v = evalExpr(st.expr, env); blocks.push(K.valueBlock(exprText(st.expr) + " = " + K.show(st.t, v), plansIn(st.expr).map(env.plan), v, st.t)); }
      else if (st.s === "explain") blocks.push(K.explainBlock(env.plan(st.plan)));
      else if (st.s === "check") {
        const e = st.expr;
        blocks.push({ kind: "check", pass: evalExpr(e, env), text: exprText(e) + "  (" + K.show(e.ct, evalExpr(e.a, env)) + " " + e.op + " " + K.show(e.ct, evalExpr(e.b, env)) + ")", line: st.line });
      }
    }
    return { blocks, text: K.renderText(blocks), plans: [...specs.keys()].map((n) => env.plan(n)) };
  }
    return { run, inputsOf, exprText, plansIn, percentScale };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = renewInterpreter;
  root.renewInterpreter = renewInterpreter;
})(typeof globalThis !== "undefined" ? globalThis : this);
