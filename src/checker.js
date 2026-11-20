// Checker for the Renew language: names, required settings and types. John Khan, Toronto, Ontario.
(function (root) {
  "use strict";
  function renewChecker(C, K, POSTED) {
    const { RenewError, suggest } = C;
  const OPS = {
    "+": [["money", "money", "money"], ["percent", "percent", "percent"], ["number", "number", "number"], ["duration", "duration", "duration"]],
    "-": [["money", "money", "money"], ["percent", "percent", "percent"], ["number", "number", "number"], ["duration", "duration", "duration"]],
    "*": [["money", "number", "money"], ["number", "money", "money"], ["money", "percent", "money"], ["percent", "money", "money"], ["percent", "number", "percent"], ["number", "percent", "percent"], ["number", "number", "number"], ["duration", "number", "duration"], ["number", "duration", "duration"]],
    "/": [["money", "number", "money"], ["money", "money", "number"], ["percent", "number", "percent"], ["percent", "percent", "number"], ["number", "number", "number"], ["duration", "duration", "number"]]
  };
  const PROP_TYPE = { balance: "money", rate: "percent", amortization: "duration", term: "duration", extra: "money", lump: "money", renews: "percent" };
  const NOUN = { money: "an amount of money", percent: "a percentage", duration: "a length of time", date: "a date", number: "a plain number", bool: "a yes or no", text: "text" };

  function postedLookup(years, date, line, col) {
    const ds = POSTED.dates;
    if (date < ds[0]) throw new RenewError("Posted rates in this copy start on " + ds[0] + ".", line, col, "Type the rate instead, for example rate 3.5%, or use a date on or after " + ds[0] + ".");
    // The series is weekly, so a date up to six days after the last week still reads that week.
    const last = ds[ds.length - 1], lastPlus6 = new Date(Date.parse(last + "T00:00:00Z") + 6 * 86400000).toISOString().slice(0, 10);
    if (date > lastPlus6) throw new RenewError("Posted rates in this copy end with the week of " + last + ". Renew will not guess a later rate.", line, col, "Use a date up to " + lastPlus6 + ", type the rate instead, for example rate 4.5%, or run npm run rates to download newer weeks from the Bank of Canada.");
    let k = 0; while (k + 1 < ds.length && ds[k + 1] <= date) k++;
    return { v: POSTED[String(years)][k], week: ds[k], series: POSTED.series[String(years)] };
  }

  function check(prog) {
    const plans = new Map(), vars = new Map(), order = [], varLines = new Map(), varValues = new Map();
    let lastMortgage = null;
    function typeOf(e) { e.ty = typeOfInner(e); return e.ty; }
    function typeOfInner(e) {
      switch (e.e) {
        case "lit": return e.t;
        case "posted": e.found = postedLookup(e.years, e.date, e.line, e.col); return "percent";
        case "var": {
          if (!vars.has(e.name)) throw new RenewError("No value is named " + JSON.stringify(e.name) + " yet.", e.line, e.col, suggest(e.name, [...vars.keys()]) || "Create it first with let " + e.name + " = ...");
          return vars.get(e.name);
        }
        case "metric": {
          if (!plans.has(e.plan)) throw new RenewError("There is no mortgage or scenario named " + JSON.stringify(e.plan) + ".", e.line, e.pcol, suggest(e.plan, [...plans.keys()]));
          return K.METRIC[e.m][0];
        }
        case "solve": {
          if (!plans.has(e.plan)) throw new RenewError("There is no mortgage or scenario named " + JSON.stringify(e.plan) + ".", e.line, e.pcol, suggest(e.plan, [...plans.keys()]));
          const tt = typeOf(e.target);
          if (tt !== "money") throw new RenewError("The payment to aim for must be an amount of money, not " + NOUN[tt] + ".", e.target.line, e.target.col);
          return e.what === "rate" ? "percent" : "duration";
        }
        case "breakeven": {
          for (const [nm, col] of [[e.plan, e.pcol], [e.ref, e.rcol]]) if (!plans.has(nm)) throw new RenewError("There is no mortgage or scenario named " + JSON.stringify(nm) + ".", e.line, col, suggest(nm, [...plans.keys()]));
          const ot = typeOf(e.over);
          if (ot !== "duration") throw new RenewError("over needs a length of time, not " + NOUN[ot] + ".", e.over.line, e.over.col, "For example: over 5 years");
          if (e.plan === e.ref) throw new RenewError("break even compares two different plans.", e.line, e.rcol);
          const ps = plans.get(e.plan);
          if (e.prop === "renews" && ps.hasRenewPath) throw new RenewError("break even changes one renewal rate, so " + JSON.stringify(e.plan) + " cannot have a renewal path with then.", e.line, e.pcol, "Compare a copy of the plan with a single renews at rate.");
          if (e.prop === "rate" && ps.hasRatePath) throw new RenewError("break even changes one rate, so " + JSON.stringify(e.plan) + " cannot have a rate path with then.", e.line, e.pcol, "Compare a copy of the plan with a single rate.");
          return PROP_TYPE[e.prop];
        }
        case "neg": { const t = typeOf(e.a); if (!["money", "percent", "number", "duration"].includes(t)) throw new RenewError("Cannot make " + NOUN[t] + " negative.", e.line, e.col); return t; }
        case "call": {
          const a = typeOf(e.a), b = typeOf(e.b);
          if (a !== b) throw new RenewError(e.f + " needs two values of the same kind, not " + NOUN[a] + " and " + NOUN[b] + ".", e.line, e.col);
          return a;
        }
        case "bin": {
          const a = typeOf(e.a), b = typeOf(e.b);
          const hit = OPS[e.op].find((r) => r[0] === a && r[1] === b);
          if (!hit) throw new RenewError("Cannot use " + e.op + " between " + NOUN[a] + " and " + NOUN[b] + ".", e.line, e.col,
            a === "money" && b === "money" && e.op === "*" ? "Multiply money by a number or a percentage instead." : plainHint(e, a, b));
          e.t = hit[2]; return hit[2];
        }
        case "cmp": {
          const a = typeOf(e.a), b = typeOf(e.b);
          if (a !== b) throw new RenewError("Cannot compare " + NOUN[a] + " with " + NOUN[b] + ".", e.line, e.col);
          if ((a === "bool" || a === "date") && !["==", "!="].includes(e.op)) { if (a === "bool") throw new RenewError("Yes or no values can only be checked with == or !=.", e.line, e.col); }
          e.ct = a; return "bool";
        }
      }
    }
    // When a rate meets a plain number that came from a let line, point at that line: it is usually a missing %.
    function plainHint(e, a, b) {
      if (!(e.op === "+" || e.op === "-")) return "";
      const side = a === "percent" && b === "number" ? e.b : b === "percent" && a === "number" ? e.a : null;
      if (!side) return "";
      if (side.e === "var" && varLines.has(side.name)) return side.name + " is a plain number (line " + varLines.get(side.name) + "). If it is a rate, write it with a percent sign there, like " + side.name + " = " + (varValues.get(side.name) !== undefined ? varValues.get(side.name) : 1.5) + "%.";
      if (side.e === "lit") return "Add a percent sign, like " + side.v + "%.";
      return "";
    }
    function checkOver(st) {
      if (!st.over) return;
      const ty = typeOf(st.over);
      if (ty !== "duration") throw new RenewError("over needs a length of time, not " + NOUN[ty] + ".", st.over.line, st.over.col, "For example: over 5 years");
    }
    for (const st of prog) {
      if (st.s === "mortgage" || st.s === "scenario") {
        if (plans.has(st.name)) throw new RenewError("The name " + JSON.stringify(st.name) + " is already used.", st.line, st.ncol);
        let base = null;
        if (st.s === "scenario") {
          const from = st.from || lastMortgage;
          if (!from) throw new RenewError("A scenario needs a mortgage above it to start from.", st.line, st.col);
          if (plans.has(from) && plans.get(from).s !== "mortgage") throw new RenewError(JSON.stringify(from) + " is a scenario. A scenario starts from a mortgage, so every scenario is one change away from a real plan.", st.line, st.fcol || st.col, "Start from the mortgage " + JSON.stringify(plans.get(from).base) + " and repeat the settings you need.");
          if (!plans.has(from) || plans.get(from).s !== "mortgage") throw new RenewError("There is no mortgage named " + JSON.stringify(from) + " above this line.", st.line, st.fcol || st.col, suggest(from, [...plans.keys()]));
          base = plans.get(from); st.base = from;
        }
        const seen = new Set();
        for (const pr of st.props) {
          if (seen.has(pr.prop)) throw new RenewError(pr.prop + " is set twice in " + JSON.stringify(st.name) + ".", pr.line, pr.col);
          seen.add(pr.prop);
          if (pr.fit) {
            const ft = typeOf(pr.fit);
            if (ft !== "money") throw new RenewError("amortization to fit needs the payment to fit under, an amount of money, not " + NOUN[ft] + ".", pr.fit.line, pr.fit.col, 'For example: amortization to fit $2,848.54, or amortization to fit payment of "Signed in 2021".');
          }
          if (pr.remainingFrom !== undefined && !plans.has(pr.remainingFrom)) throw new RenewError("There is no mortgage or scenario named " + JSON.stringify(pr.remainingFrom) + " above this line.", pr.line, pr.rcol, suggest(pr.remainingFrom, [...plans.keys()]));
          for (const stp of pr.path || []) {
            const rt = typeOf(stp.rate), at = typeOf(stp.after);
            if (rt !== "percent") throw new RenewError("Each rate in a rate path must be a percentage, not " + NOUN[rt] + ".", stp.rate.line, stp.rate.col, rt === "number" ? "Add a percent sign, like " + stp.rate.v + "%." : "");
            if (at !== "duration") throw new RenewError("after needs a length of time, not " + NOUN[at] + ".", stp.after.line, stp.after.col, rt === "number" || at === "number" ? "Add months or years, like after 12 months." : "");
          }
          if (pr.prop === "renews" && (pr.path || []).length) st.hasRenewPath = true;
          if (pr.prop === "rate") st.hasRatePath = (pr.path || []).length > 0;
          // The variable label: where it was written, so a bare label with nothing to vary can be refused.
          if (pr.prop === "rate") { st.ownRate = true; st.rateKind = pr.kind || (base ? base.rateKind : undefined); st.kindAt = pr.kind ? { line: pr.kline, col: pr.kcol } : (base ? base.kindAt : undefined); st.held = !!pr.paymentHeld; }
          if (pr.expr) {
            const t = typeOf(pr.expr);
            if (t !== PROP_TYPE[pr.prop]) throw new RenewError(pr.prop + " must be " + NOUN[PROP_TYPE[pr.prop]] + ", not " + NOUN[t] + ".", pr.line, pr.expr.col,
              pr.prop === "rate" && t === "number" ? "Add a percent sign, like " + pr.expr.v + "%." : pr.prop === "balance" && t === "number" ? "Add a dollar sign, like $" + pr.expr.v + "." : (pr.prop === "term" || pr.prop === "amortization") && t === "number" ? "Add years or months, like " + pr.expr.v + " years." : "");
          }
        }
        st.fields = new Set([...(base ? base.fields : []), ...seen]);
        if (!st.ownRate && base) { st.rateKind = base.rateKind; st.kindAt = base.kindAt; st.held = base.held; }
        if (base && base.hasRenewPath && !seen.has("renews")) st.hasRenewPath = true;
        if (base && base.hasRatePath && !seen.has("rate")) st.hasRatePath = true;
        for (const need of ["balance", "rate", "amortization", "term"]) if (!st.fields.has(need))
          throw new RenewError(JSON.stringify(st.name) + " needs a " + need + " setting.", st.line, st.col, "Add an indented line such as " + { balance: "balance $412,500", rate: "rate 4.79%", amortization: "amortization 20 years", term: "term 5 years" }[need] + ".");
        plans.set(st.name, st); order.push(st.name);
        if (st.s === "mortgage") lastMortgage = st.name;
      } else if (st.s === "let" || st.s === "input") {
        if (vars.has(st.name)) throw new RenewError(JSON.stringify(st.name) + " already has a value. Renew names are set once.", st.line, st.col);
        vars.set(st.name, typeOf(st.expr)); varLines.set(st.name, st.line);
        if (st.s === "input" && !["money", "percent", "duration", "number"].includes(st.expr.ty)) throw new RenewError("An input must be an amount of money, a percentage, a length of time or a plain number, not " + NOUN[st.expr.ty] + ".", st.line, st.expr.col);
        if (st.expr.e === "lit") varValues.set(st.name, st.expr.v);
      } else if (st.s === "compare") {
        for (const pn of st.plans || []) if (!plans.has(pn.name)) throw new RenewError("There is no mortgage or scenario named " + JSON.stringify(pn.name) + ".", st.line, pn.col, suggest(pn.name, [...plans.keys()]));
        if (!(st.plans || order).length) throw new RenewError("There is nothing to compare yet.", st.line, st.col);
        st.planNames = st.plans ? st.plans.map((x) => x.name) : order.slice();
        st.metricList = st.metrics || ["payment", "interest", "balance", "payoff"];
        checkOver(st);
      } else if (st.s === "sweep") {
        if (!plans.has(st.plan)) throw new RenewError("There is no mortgage or scenario named " + JSON.stringify(st.plan) + ".", st.line, st.pcol, suggest(st.plan, [...plans.keys()]));
        const want = PROP_TYPE[st.prop];
        for (const part of ["from", "to", "step"]) {
          const ty = typeOf(st[part]);
          if (ty !== want) throw new RenewError("A " + st.prop + " sweep needs " + NOUN[want] + " after " + part + ", not " + NOUN[ty] + ".", st[part].line, st[part].col,
            { percent: "For example: from 4% to 7% step 0.5%", money: "For example: from $0 to $500 step $100", duration: "For example: from 20 years to 30 years step 5 years" }[want]);
        }
        st.ptype = want;
        if (st.against !== undefined && !plans.has(st.against)) throw new RenewError("There is no mortgage or scenario named " + JSON.stringify(st.against) + ".", st.line, st.acol, suggest(st.against, [...plans.keys()]));
        st.metricList = st.metrics || ["payment", "interest", "balance", "payoff"];
        checkOver(st);
      } else if (st.s === "show" || st.s === "explain") {
        if (st.plan !== undefined && !plans.has(st.plan)) throw new RenewError("There is no mortgage or scenario named " + JSON.stringify(st.plan) + ".", st.line, st.pcol, suggest(st.plan, [...plans.keys()]));
        if (st.expr) {
          st.t = typeOf(st.expr);
          // rate minus rate is shown in percentage points
          if (st.expr.e === "bin" && st.expr.op === "-" && st.expr.a.ty === "percent" && st.expr.b.ty === "percent") st.t = "points";
        }
      } else if (st.s === "check") {
        if (typeOf(st.expr) !== "bool") throw new RenewError("check needs a comparison, like payment of \"A\" <= $3,000.", st.line, st.col);
      }
    }
    // Round 8, tightened in round 9: a plan marked variable must have something that actually changes its
    // rate: a rate path inside the term, renews at, or a sweep of rate or renews for that plan. payment held is
    // not a rate change (it only says what the payment does when the rate changes), and a sweep of balance,
    // extra, lump, term or amortization does not change the rate either, so neither counts.
    const rateSwept = new Set(prog.filter((st) => st.s === "sweep" && (st.prop === "rate" || st.prop === "renews")).map((st) => st.plan));
    for (const name of order) {
      const st = plans.get(name);
      if (st.rateKind !== "variable" || st.hasRatePath || st.fields.has("renews") || rateSwept.has(name)) continue;
      const at = st.kindAt || st;
      if (st.held) throw new RenewError(JSON.stringify(name) + " has payment held, but nothing in the program changes its rate, so holding the payment would change nothing in the maths.", at.line, at.col,
        "payment held keeps the payment when the rate changes. Give it a rate path, like rate 4.2% then 5.5% after 6 months payment held, or add sweep " + JSON.stringify(name) + " rate from 4% to 6% step 0.5%. Or leave payment held out.");
      throw new RenewError(JSON.stringify(name) + " is marked variable, but nothing in the program changes its rate, so the label would change nothing in the maths.", at.line, at.col,
        "Give it a rate path, like rate 5.2% variable then 4.7% after 12 months, add renews at 5% for the rate after the term, or add sweep " + JSON.stringify(name) + " rate from 4% to 6% step 0.5% to see a range. A sweep of balance, extra, lump, term or amortization does not change the rate. Or leave the word variable out.");
    }
    return prog;
  }
    return { check };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = renewChecker;
  root.renewChecker = renewChecker;
})(typeof globalThis !== "undefined" ? globalThis : this);
