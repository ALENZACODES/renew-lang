// Compiler: Renew to a standalone JavaScript program. John Khan, Toronto, Ontario.
(function (root) {
  "use strict";
  function renewCompiler(C, K, parse, check, interp, kernelFactory) {
    const { NL } = C;
    const { exprText, plansIn, percentScale } = interp;
  function compile(src, opts) {
    const prog = check(parse(src));
    const J = JSON.stringify, out = [], ids = new Map();
    const planId = (n) => ids.get(n);
    function lower(e) {
      switch (e.e) {
        case "lit": return e.t === "date" ? J(e.v) : String(e.v);
        case "posted": return "/* Bank of Canada " + e.found.series + ", week of " + e.found.week + " */ " + e.found.v;
        case "var": return "v_" + e.name.replace(/-/g, "_");
        case "metric": return "K.metric(" + planId(e.plan) + "(), " + J(e.m) + ")";
        case "solve": return "K." + (e.what === "rate" ? "rateNeeded" : "amortizationNeeded") + "(" + planId(e.plan) + "().spec, " + lower(e.target) + ")";
        case "breakeven": return "breakEven(" + planId(e.plan) + "(), " + planId(e.ref) + "(), " + J(e.prop) + ", " + J(e.m) + ", " + lower(e.over) + ", " + e.line + ").value";
        case "neg": return "(-" + lower(e.a) + ")";
        case "call": return "Math." + e.f + "(" + lower(e.a) + ", " + lower(e.b) + ")";
        case "bin": {
          const scale = percentScale(e) ? " * 0.01" : "";
          if (e.op === "/") return "div(" + lower(e.a) + ", " + lower(e.b) + ", " + e.line + ")";
          return "(" + lower(e.a) + " " + e.op + " " + lower(e.b) + scale + ")";
        }
        case "cmp": {
          const op = e.op === "==" ? "===" : e.op === "!=" ? "!==" : e.op;
          return e.ct === "money" ? "(K.cents(" + lower(e.a) + ") " + op + " K.cents(" + lower(e.b) + "))" : "(" + lower(e.a) + " " + op + " " + lower(e.b) + ")";
        }
      }
    }
    const moduleMode = !!(opts && opts.module);
    out.push("// Compiled by renewc from a Renew program. " + (moduleMode ? "An ES module: import { run, inputs } and call run({ name: value })." : "Runs on its own with Node 18 or newer, or in a browser. Inputs can be set with --name=value."));
    out.push("// Rate maths: blended payments with the rate compounded as stated, half yearly unless the program says otherwise.");
    if (!moduleMode) out.push('"use strict";');
    out.push("const K = (" + kernelFactory.toString() + ")();");
    out.push("function div(a, b, line) { if (b === 0) throw new Error(\"Line \" + line + \": this divides by zero.\"); return a / b; }");
    out.push("function lazy(spec, line) { let p = null; return () => { if (p) return p; const s = spec(); try { p = K.plan(s); } catch (err) { if (err.planError) throw new Error(\"Line \" + line + \": \" + err.message); throw err; } return p; }; }");
    // validation mirrors validateSpec so compiled programs refuse the same bad plans
    out.push("function check(s, line) { const bad = (m) => { throw new Error(\"Line \" + line + \": \" + m); }; if (!(s.balance > 0)) bad(\"The balance must be more than $0.\"); if (!(s.rate >= 0 && s.rate < 100)) bad(\"The rate must be between 0% and 100%.\"); if (!(s.amortization >= 1 && s.amortization <= 600)) bad(\"The amortization must be between 1 month and 50 years.\"); if (!(s.term >= 1 && s.term <= s.amortization)) bad(\"The term must be at least 1 month and no longer than the amortization.\"); if (s.extra < 0 || s.lump < 0) bad(\"Extra payments cannot be negative.\"); if (typeof s.renews === \"number\" && !(s.renews >= 0 && s.renews < 100)) bad(\"The renews at rate must be between 0% and 100%.\"); const pp = K.pathProblem(s); if (pp) bad(pp); return s; }");
    out.push("function fit(s, target, line) { const m = K.fitAmortization(s, target); if (m === null) throw new Error(\"Line \" + line + \": no amortization up to 50 years brings the payment to \" + K.money(target) + \" or less.\"); return Object.assign(s, { amortization: m }); }");
    out.push("function left(s, line) { const m = s.amortization - s.term; if (m < 1) throw new Error(\"Line \" + line + \": no amortization is left after the term of \" + JSON.stringify(s.name) + \".\"); return m; }");
    out.push("function breakEven(p, ref, prop, m, h, line) { if (prop === \"renews\" && !(p.spec.term < h)) throw new Error(\"Line \" + line + \": break even needs a horizon longer than the term of \" + JSON.stringify(p.name) + \" (\" + K.dur(p.spec.term) + \"), or the renewal rate makes no difference inside it.\"); try { return K.breakEvenSetting(p.spec, ref, prop, m, h); } catch (err) { throw new Error(\"Line \" + line + \": \" + err.message); } }");
    const inputs = prog.filter((st) => st.s === "input");
    out.push("const INPUTS = " + J(Object.fromEntries(inputs.map((st) => [st.name, { type: st.expr.ty, default: exprText(st.expr), line: st.line }]))) + ";");
    out.push("function run(inputs) {");
    out.push("  inputs = inputs || {};");
    out.push("  for (const k of Object.keys(inputs)) if (!Object.prototype.hasOwnProperty.call(INPUTS, k)) throw new Error(\"This program has no input named \" + JSON.stringify(k) + \".\");");
    out.push("  const blocks = [];");
    const body = [];
    let k = 0;
    const path = (pr) => "[" + (pr.path || []).map((x) => "{ rate: " + lower(x.rate) + ", after: " + lower(x.after) + " }").join(", ") + "]";
    for (const st of prog) {
      body.push("// line " + st.line + ": " + st.s + (st.name ? " " + J(st.name) : ""));
      if (st.s === "mortgage" || st.s === "scenario") {
        const id = "plan" + k++; ids.set(st.name, id);
        const parts = [];
        const base = st.base ? planId(st.base) + "().spec" : J({ compounded: "semi-annually", payments: "monthly", extra: 0, lump: 0 });
        for (const pr of st.props) {
          if (pr.fit) continue;
          if (pr.remainingFrom !== undefined) { parts.push("\"amortization\": left(" + planId(pr.remainingFrom) + "().spec, " + pr.line + ")"); continue; }
          parts.push(J(pr.prop) + ": " + (pr.expr ? lower(pr.expr) : J(pr.value)));
          if (pr.prop === "rate") parts.push("ratePath: " + path(pr), "paymentHeld: " + !!pr.paymentHeld);
          if (pr.prop === "renews") parts.push("renewPath: " + path(pr));
        }
        for (const pr of st.props) if (pr.prop === "rate" && pr.kind) parts.push("rateKind: " + J(pr.kind));
        for (const pr of st.props) if (pr.prop === "rate") parts.push("rateBasis: " + J(pr.expr.e === "posted" ? "posted" : "typed"));
        let spec = "Object.assign({}, " + base + ", { name: " + J(st.name) + ", " + parts.join(", ") + " })";
        const fp = st.props.find((pr) => pr.fit);
        if (fp) spec = "fit(" + spec + ", " + lower(fp.fit) + ", " + fp.line + ")";
        body.push("const " + id + " = lazy(() => check(" + spec + ", " + st.line + "), " + st.line + ");");
      } else if (st.s === "let") body.push("const v_" + st.name.replace(/-/g, "_") + " = " + lower(st.expr) + ";");
      else if (st.s === "input") body.push("const v_" + st.name.replace(/-/g, "_") + " = Object.prototype.hasOwnProperty.call(inputs, " + J(st.name) + ") ? K.inputValue(" + J(st.name) + ", " + J(st.expr.ty) + ", inputs[" + J(st.name) + "]) : " + lower(st.expr) + ";");
      else if (st.s === "compare") body.push("blocks.push(K.compareBlock([" + st.planNames.map((n) => planId(n) + "()").join(", ") + "], " + J(st.metricList) + ", " + (st.over ? lower(st.over) : "null") + "));");
      else if (st.s === "sweep") body.push("blocks.push(K.sweepBlock(" + planId(st.plan) + "().spec, " + J(st.prop) + ", " + J(st.ptype) + ", " + lower(st.from) + ", " + lower(st.to) + ", " + lower(st.step) + ", " + J(st.metricList) + ", " + (st.over ? lower(st.over) : "null") + ", " + st.line + ", " + (st.against !== undefined ? planId(st.against) + "()" : "null") + "));");
      else if (st.s === "show" && st.what === "schedule") body.push("blocks.push(K.scheduleBlock(" + planId(st.plan) + "(), " + (st.first || 0) + "));");
      else if (st.s === "show" && st.what === "yearly") body.push("blocks.push(K.yearlyBlock(" + planId(st.plan) + "()));");
      else if (st.s === "show" && st.expr.e === "breakeven") {
        const e = st.expr;
        body.push("{ const r = breakEven(" + planId(e.plan) + "(), " + planId(e.ref) + "(), " + J(e.prop) + ", " + J(e.m) + ", " + lower(e.over) + ", " + e.line + "), h = " + lower(e.over) + "; const b = K.valueBlock(" + J(exprText(e) + " = ") + " + K.breakEvenText(r), [" + plansIn(e).map((n) => planId(n) + "()").join(", ") + "], r.value, r.type); b.notes.unshift(K.breakEvenNote(r, " + J(e.plan) + ", " + J(e.ref) + ", " + J(e.m) + ", h)); " + (e.m === "paid" ? "b.notes.splice(1, 0, K.paidNote(h)); " : "") + "blocks.push(b); }");
      }
      else if (st.s === "show") body.push("{ const v = " + lower(st.expr) + "; blocks.push(K.valueBlock(" + J(exprText(st.expr) + " = ") + " + K.show(" + J(st.t) + ", v), [" + plansIn(st.expr).map((n) => planId(n) + "()").join(", ") + "], v, " + J(st.t) + ")); }");
      else if (st.s === "explain") body.push("blocks.push(K.explainBlock(" + planId(st.plan) + "()));");
      else if (st.s === "check") {
        const e = st.expr;
        body.push("blocks.push({ kind: \"check\", pass: " + lower(e) + ", text: " + J(exprText(e) + "  (") + " + K.show(" + J(e.ct) + ", " + lower(e.a) + ") + " + J(" " + e.op + " ") + " + K.show(" + J(e.ct) + ", " + lower(e.b) + ") + \")\", line: " + st.line + " });");
      }
    }
    for (const l of body) out.push("  " + l);
    out.push("  return { blocks, report: K.renderText(blocks) };");
    out.push("}");
    if (moduleMode) {
      out.push("export { run, INPUTS as inputs };");
    } else {
      out.push("const isMain = typeof require !== \"undefined\" && typeof module !== \"undefined\" && require.main === module;");
      out.push("function cliInputs() { const o = {}; for (const a of process.argv.slice(2)) { const m = /^--([A-Za-z_][A-Za-z_-]*)=(.*)$/.exec(a); if (m) o[m[1]] = m[2]; } return o; }");
      out.push("const result = run(isMain ? cliInputs() : {});");
      out.push("const blocks = result.blocks, report = result.report;");
      out.push("if (typeof module !== \"undefined\" && module.exports) module.exports = { blocks, report, run, inputs: INPUTS };");
      out.push("if (isMain) process.stdout.write(report);");
    }
    return out.join(NL) + NL;
  }
    return { compile };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = renewCompiler;
  root.renewCompiler = renewCompiler;
})(typeof globalThis !== "undefined" ? globalThis : this);
