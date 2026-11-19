// Renew: a small language for Canadian mortgage renewal decisions. John Khan, Toronto, Ontario.
// Pipeline: source -> lex -> parse (AST) -> check (names and types) -> run (interpreter) or compile (JavaScript).
(function (root) {
  "use strict";
  const kernelFactory = typeof renewKernel !== "undefined" ? renewKernel : require("./kernel.js");
  const POSTED = typeof RENEW_POSTED !== "undefined" ? RENEW_POSTED : require("./posted_rates.js");
  const K = kernelFactory();
  const NL = String.fromCharCode(10);

  class RenewError extends Error {
    constructor(message, line, col, hint) { super(message); this.line = line; this.col = col; this.hint = hint || ""; }
  }
  function editDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i].concat(Array(b.length).fill(0)));
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function suggest(word, options) {
    let best = null, bd = 3;
    for (const o of options) { const x = editDistance(String(word).toLowerCase(), o.toLowerCase()); if (x < bd) { bd = x; best = o; } }
    return best ? "Did you mean " + JSON.stringify(best) + "?" : "";
  }

  // ---------- Lexer ----------
  const WORD = /[A-Za-z_][A-Za-z_-]*/y, NUMBER = /\d{1,3}(?:,\d{3})+(?!\d)(?:\.\d+)?|\d+(?:\.\d+)?/y, DATE = /\d{4}-\d{2}-\d{2}(?![\d])/y;
  function lex(src) {
    const lines = String(src).replace(/\r\n?/g, NL).split(NL), out = [];
    lines.forEach((text, li) => {
      const line = li + 1, toks = [];
      let i = 0;
      const indent = /^[ \t]+/.test(text) && text.trim() !== "";
      while (i < text.length) {
        const ch = text[i];
        if (ch === " " || ch === "\t") { i++; continue; }
        if (ch === "#") break;
        const col = i + 1;
        DATE.lastIndex = i; let m = DATE.exec(text);
        if (m) { toks.push({ k: "date", v: m[0], line, col }); i += m[0].length; continue; }
        if (ch === "$") {
          NUMBER.lastIndex = i + 1; m = NUMBER.exec(text);
          if (!m) throw new RenewError("A dollar sign needs an amount after it, like $412,500.", line, col);
          toks.push({ k: "money", v: parseNum(m[0], line, col), line, col }); i += 1 + m[0].length;
          if (text[i] === "," && /\d/.test(text[i + 1] || "")) throw new RenewError("Commas in a number must group thousands, like 412,500.", line, col, "In a list, put a space after each comma.");
          continue;
        }
        NUMBER.lastIndex = i; m = NUMBER.exec(text);
        if (m) {
          const v = parseNum(m[0], line, col); i += m[0].length;
          if (text[i] === "," && /\d/.test(text[i + 1] || "")) throw new RenewError("Commas in a number must group thousands, like 412,500.", line, col, "In a list, put a space after each comma.");
          if (text[i] === "%") { toks.push({ k: "percent", v, line, col }); i++; }
          else toks.push({ k: "number", v, line, col });
          continue;
        }
        if (ch === '"') {
          const end = text.indexOf('"', i + 1);
          if (end < 0) throw new RenewError("This name is missing its closing quote.", line, col, 'Names look like "Stay put".');
          toks.push({ k: "string", v: text.slice(i + 1, end), line, col }); i = end + 1; continue;
        }
        WORD.lastIndex = i; m = WORD.exec(text);
        if (m) { toks.push({ k: "word", v: m[0].toLowerCase(), raw: m[0], line, col }); i += m[0].length; continue; }
        const two = text.slice(i, i + 2);
        if (["<=", ">=", "==", "!="].includes(two)) { toks.push({ k: "op", v: two, line, col }); i += 2; continue; }
        if ("+-*/(),=<>".includes(ch)) { toks.push({ k: "op", v: ch, line, col }); i++; continue; }
        throw new RenewError("Renew does not use the character " + JSON.stringify(ch) + ".", line, col);
      }
      if (toks.length) out.push({ line, indent, toks, text });
    });
    return out;
  }
  function parseNum(s, line, col) {
    if (/,/.test(s) && !/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(s)) throw new RenewError("Commas in " + s + " must group thousands, like 412,500.", line, col);
    return Number(s.replace(/,/g, ""));
  }

  // ---------- Parser ----------
  const TOP = ["mortgage", "scenario", "let", "compare", "show", "explain", "check"];
  const PROPS = ["balance", "rate", "compounded", "amortization", "payments", "term", "extra", "lump"];
  const METRICS = Object.keys(K.METRIC).filter((m) => m !== "three months interest").concat(["three months interest"]);
  const FREQS = Object.keys(K.FREQ);

  function Parser(line) { this.t = line.toks; this.i = 0; this.line = line; }
  Parser.prototype = {
    peek(o) { return this.t[this.i + (o || 0)]; },
    end() { return this.i >= this.t.length; },
    next() { return this.t[this.i++]; },
    here() { const t = this.peek() || this.t[this.t.length - 1]; return t ? [t.line, this.peek() ? t.col : t.col + String(t.raw || t.v).length + 1] : [this.line.line, 1]; },
    fail(msg, hint) { const [l, c] = this.here(); throw new RenewError(msg, l, c, hint); },
    isWord(w, o) { const t = this.peek(o); return t && t.k === "word" && t.v === w; },
    isOp(v) { const t = this.peek(); return t && t.k === "op" && t.v === v; },
    word(w, hint) { if (!this.isWord(w)) this.fail("Expected " + JSON.stringify(w) + " here.", hint); return this.next(); },
    string(what) { const t = this.peek(); if (!t || t.k !== "string") this.fail("Expected a quoted name for the " + what + ".", 'For example "Stay put".'); return this.next(); },
    done() { if (!this.end()) this.fail("Unexpected " + JSON.stringify(this.peek().raw || this.peek().v) + " at the end of this line."); },
    expr() { return this.comparison(); },
    comparison() {
      const a = this.additive();
      const t = this.peek();
      if (t && t.k === "op" && ["<", ">", "<=", ">=", "==", "!="].includes(t.v)) { this.next(); return { e: "cmp", op: t.v, a, b: this.additive(), line: t.line, col: t.col }; }
      return a;
    },
    additive() {
      let a = this.mult();
      while (this.isOp("+") || this.isOp("-")) { const t = this.next(); a = { e: "bin", op: t.v, a, b: this.mult(), line: t.line, col: t.col }; }
      return a;
    },
    mult() {
      let a = this.unary();
      while (this.isOp("*") || this.isOp("/")) { const t = this.next(); a = { e: "bin", op: t.v, a, b: this.unary(), line: t.line, col: t.col }; }
      return a;
    },
    unary() {
      if (this.isOp("-")) { const t = this.next(); return { e: "neg", a: this.unary(), line: t.line, col: t.col }; }
      return this.primary();
    },
    duration(first) {
      let months = 0;
      const unit = (n, t) => {
        const w = this.peek();
        if (w && w.k === "word" && (w.v === "year" || w.v === "years")) { this.next(); return n * 12; }
        if (w && w.k === "word" && (w.v === "month" || w.v === "months")) { this.next(); return n; }
        return null;
      };
      const m1 = unit(first.v, first);
      if (m1 === null) return null;
      months += m1;
      const t2 = this.peek(), w2 = this.peek(1);
      if (t2 && t2.k === "number" && w2 && w2.k === "word" && /^months?$/.test(w2.v)) { this.next(); this.next(); months += t2.v; }
      if (!Number.isInteger(months)) throw new RenewError("Durations must come to whole months.", first.line, first.col);
      return { e: "lit", t: "duration", v: months, line: first.line, col: first.col };
    },
    primary() {
      const t = this.peek();
      if (!t) this.fail("This line ends where a value was expected.");
      if (t.k === "number") { this.next(); return this.duration(t) || { e: "lit", t: "number", v: t.v, line: t.line, col: t.col }; }
      if (t.k === "money") { this.next(); return { e: "lit", t: "money", v: t.v, line: t.line, col: t.col }; }
      if (t.k === "percent") { this.next(); return { e: "lit", t: "percent", v: t.v, line: t.line, col: t.col }; }
      if (t.k === "date") { this.next(); return { e: "lit", t: "date", v: t.v, line: t.line, col: t.col }; }
      if (t.k === "string") this.fail("A quoted name cannot be used as a value on its own.", 'Ask for something about it, like payment of ' + JSON.stringify(t.v) + ".");
      if (t.k === "op" && t.v === "(") { this.next(); const e = this.expr(); if (!this.isOp(")")) this.fail("Expected a closing bracket."); this.next(); return e; }
      if (t.k === "word") {
        if (t.v === "posted") {
          this.next();
          const n = this.peek();
          if (!n || n.k !== "number" || ![1, 3, 5].includes(n.v)) this.fail("Posted rates are available for 1, 3 and 5 year terms.", "For example: posted 5 year on 2026-11-18");
          this.next();
          if (!(this.isWord("year") || this.isWord("years"))) this.fail('Expected "year" after the term length.');
          this.next(); this.word("on", "For example: posted 5 year on 2026-11-18");
          const d = this.peek();
          if (!d || d.k !== "date") this.fail("Expected a date like 2026-11-18.");
          this.next();
          return { e: "posted", years: n.v, date: d.v, line: t.line, col: t.col };
        }
        if ((t.v === "rate" || t.v === "amortization") && this.isWord("needed", 1)) {
          this.next(); this.next(); this.word("for", 'Write ' + t.v + ' needed for "Name" at $3,000.');
          const s = this.string("plan"); this.word("at", 'Then the payment to aim for, like at $3,000.');
          return { e: "solve", what: t.v, plan: s.v, target: this.additive(), line: t.line, col: t.col, pcol: s.col };
        }
        if (t.v === "three" && this.isWord("months", 1) && this.isWord("interest", 2)) {
          this.next(); this.next(); this.next(); this.word("of", 'Write three months interest of "Name".');
          const s = this.string("plan"); return { e: "metric", m: "three months interest", plan: s.v, line: t.line, col: t.col, pcol: s.col };
        }
        if (K.METRIC[t.v] && this.isWord("of", 1)) {
          this.next(); this.next(); const s = this.string("plan");
          return { e: "metric", m: t.v, plan: s.v, line: t.line, col: t.col, pcol: s.col };
        }
        if ((t.v === "min" || t.v === "max") && this.peek(1) && this.peek(1).v === "(") {
          this.next(); this.next(); const a = this.expr(); if (!this.isOp(",")) this.fail("min and max take two values separated by a comma.");
          this.next(); const b = this.expr(); if (!this.isOp(")")) this.fail("Expected a closing bracket."); this.next();
          return { e: "call", f: t.v, a, b, line: t.line, col: t.col };
        }
        if (t.v === "yes" || t.v === "no") { this.next(); return { e: "lit", t: "bool", v: t.v === "yes", line: t.line, col: t.col }; }
        if (K.METRIC[t.v]) this.fail("Say which plan: " + t.v + ' of "Name".');
        this.next(); return { e: "var", name: t.v, line: t.line, col: t.col };
      }
      this.fail("Expected a value here.");
    }
  };

  function parseProp(p, owner) {
    const t = p.peek();
    if (!t || t.k !== "word" || !PROPS.includes(t.v)) p.fail("Unknown setting " + JSON.stringify(t && (t.raw || t.v)) + " in " + owner + ".", suggest(t && t.v, PROPS) || "Settings are: " + PROPS.join(", ") + ".");
    p.next();
    const prop = { prop: t.v, line: t.line, col: t.col };
    if (t.v === "compounded") {
      const w = p.next();
      if (!w || !K.COMPOUND[w.v]) p.i--, p.fail("Compounding can be semi-annually, monthly or annually.", suggest(w && w.v, Object.keys(K.COMPOUND)));
      prop.value = w.v;
    } else if (t.v === "payments") {
      let w = p.next(); let name = w && w.v;
      if (name === "accelerated") { const w2 = p.next(); name = "accelerated " + (w2 && w2.v); }
      if (!K.FREQ[name]) { p.i--; p.fail("Payments can be " + FREQS.join(", ") + ".", suggest(name, FREQS)); }
      prop.value = name;
    } else {
      prop.expr = p.expr();
      if (t.v === "rate" && (p.isWord("fixed") || p.isWord("variable"))) prop.kind = p.next().v;
      if (t.v === "extra") { p.word("per", 'Write extra $200 per payment.'); p.word("payment", 'Write extra $200 per payment.'); }
      if (t.v === "lump") { p.word("every", 'Write lump $5,000 every year.'); p.word("year", 'Write lump $5,000 every year.'); }
      if (t.v === "amortization" && p.isWord("remaining")) p.next();
    }
    p.done();
    return prop;
  }

  function parse(src) {
    const lines = lex(src), prog = [];
    let block = null;
    for (const ln of lines) {
      const p = new Parser(ln);
      if (ln.indent) {
        if (!block) p.fail("This line is indented but is not inside a mortgage or scenario.", "Start a block with mortgage \"Name\" or scenario \"Name\".");
        block.props.push(parseProp(p, block.kind + " " + JSON.stringify(block.name)));
        continue;
      }
      block = null;
      const t = p.peek();
      if (t.k !== "word" || !TOP.includes(t.v)) p.fail("Lines start with one of: " + TOP.join(", ") + ".", suggest(t.v, TOP));
      p.next();
      const st = { s: t.v, line: t.line, col: t.col };
      if (t.v === "mortgage" || t.v === "scenario") {
        const n = p.string(t.v); st.name = n.v; st.ncol = n.col; st.props = []; st.kind = t.v;
        if (t.v === "scenario" && p.isWord("from")) { p.next(); const b = p.string("starting mortgage"); st.from = b.v; st.fcol = b.col; }
        p.done(); block = st;
      } else if (t.v === "let") {
        const n = p.next();
        if (!n || n.k !== "word") p.i--, p.fail("Expected a name after let.", "For example: let budget = $2,900");
        if (TOP.includes(n.v) || PROPS.includes(n.v) || K.METRIC[n.v]) throw new RenewError(JSON.stringify(n.v) + " is a Renew word and cannot be a name.", n.line, n.col);
        if (!p.isOp("=")) p.fail("Expected = after the name."); p.next();
        st.name = n.v; st.expr = p.expr(); p.done();
      } else if (t.v === "compare") {
        st.plans = null; st.metrics = null;
        if (p.isWord("all")) p.next();
        else if (p.peek() && p.peek().k === "string") {
          st.plans = [];
          do { const s = p.string("plan"); st.plans.push({ name: s.v, col: s.col }); } while (p.isOp(",") && p.next());
        }
        if (p.isWord("by")) {
          p.next(); st.metrics = [];
          do {
            const w = p.peek();
            if (w && w.v === "three" && p.isWord("months", 1)) { p.next(); p.next(); p.word("interest"); st.metrics.push("three months interest"); continue; }
            if (!w || !K.METRIC[w.v]) p.fail("Unknown measure " + JSON.stringify(w && (w.raw || w.v)) + ".", suggest(w && w.v, METRICS) || "Measures are: " + METRICS.join(", ") + ".");
            st.metrics.push(p.next().v);
          } while (p.isOp(",") && p.next());
        }
        p.done();
      } else if (t.v === "show") {
        if ((p.isWord("schedule") || p.isWord("yearly")) && p.peek(1) && p.peek(1).k === "string") {
          st.what = p.next().v; const s = p.string("plan"); st.plan = s.v; st.pcol = s.col;
          if (p.isWord("first")) { p.next(); const n = p.next(); if (!n || n.k !== "number" || !Number.isInteger(n.v) || n.v < 1) p.i--, p.fail("Expected a whole number of payments after first."); st.first = n.v; }
        } else { st.what = "value"; st.expr = p.expr(); }
        p.done();
      } else if (t.v === "explain") {
        const s = p.string("plan"); st.plan = s.v; st.pcol = s.col; p.done();
      } else if (t.v === "check") {
        st.expr = p.expr(); p.done();
      }
      prog.push(st);
    }
    return prog;
  }

  // ---------- Checker: names, required settings and types ----------
  const OPS = {
    "+": [["money", "money", "money"], ["percent", "percent", "percent"], ["number", "number", "number"], ["duration", "duration", "duration"]],
    "-": [["money", "money", "money"], ["percent", "percent", "percent"], ["number", "number", "number"], ["duration", "duration", "duration"]],
    "*": [["money", "number", "money"], ["number", "money", "money"], ["money", "percent", "money"], ["percent", "money", "money"], ["percent", "number", "percent"], ["number", "percent", "percent"], ["number", "number", "number"], ["duration", "number", "duration"], ["number", "duration", "duration"]],
    "/": [["money", "number", "money"], ["money", "money", "number"], ["percent", "number", "percent"], ["percent", "percent", "number"], ["number", "number", "number"], ["duration", "duration", "number"]]
  };
  const PROP_TYPE = { balance: "money", rate: "percent", amortization: "duration", term: "duration", extra: "money", lump: "money" };
  const NOUN = { money: "an amount of money", percent: "a percentage", duration: "a length of time", date: "a date", number: "a plain number", bool: "a yes or no", text: "text" };

  function postedLookup(years, date, line, col) {
    const ds = POSTED.dates;
    if (date < ds[0]) throw new RenewError("Posted rates in this copy start on " + ds[0] + ".", line, col);
    // The series is weekly, so a date up to six days after the last week still reads that week.
    const last = ds[ds.length - 1], lastPlus6 = new Date(Date.parse(last + "T00:00:00Z") + 6 * 86400000).toISOString().slice(0, 10);
    if (date > lastPlus6) throw new RenewError("Posted rates in this copy end with the week of " + last + ". Renew will not guess a later rate.", line, col, "Update data/posted_rates.json from the Bank of Canada to use later dates.");
    let k = 0; while (k + 1 < ds.length && ds[k + 1] <= date) k++;
    return { v: POSTED[String(years)][k], week: ds[k], series: POSTED.series[String(years)] };
  }

  function check(prog) {
    const plans = new Map(), vars = new Map(), order = [];
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
            a === "money" && b === "money" && e.op === "*" ? "Multiply money by a number or a percentage instead." : "");
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
    for (const st of prog) {
      if (st.s === "mortgage" || st.s === "scenario") {
        if (plans.has(st.name)) throw new RenewError("The name " + JSON.stringify(st.name) + " is already used.", st.line, st.ncol);
        let base = null;
        if (st.s === "scenario") {
          const from = st.from || lastMortgage;
          if (!from) throw new RenewError("A scenario needs a mortgage above it to start from.", st.line, st.col);
          if (!plans.has(from) || plans.get(from).s !== "mortgage") throw new RenewError("There is no mortgage named " + JSON.stringify(from) + " above this line.", st.line, st.fcol || st.col, suggest(from, [...plans.keys()]));
          base = plans.get(from); st.base = from;
        }
        const seen = new Set();
        for (const pr of st.props) {
          if (seen.has(pr.prop)) throw new RenewError(pr.prop + " is set twice in " + JSON.stringify(st.name) + ".", pr.line, pr.col);
          seen.add(pr.prop);
          if (pr.expr) {
            const t = typeOf(pr.expr);
            if (t !== PROP_TYPE[pr.prop]) throw new RenewError(pr.prop + " must be " + NOUN[PROP_TYPE[pr.prop]] + ", not " + NOUN[t] + ".", pr.line, pr.expr.col,
              pr.prop === "rate" && t === "number" ? "Add a percent sign, like " + pr.expr.v + "%." : pr.prop === "balance" && t === "number" ? "Add a dollar sign, like $" + pr.expr.v + "." : (pr.prop === "term" || pr.prop === "amortization") && t === "number" ? "Add years or months, like " + pr.expr.v + " years." : "");
          }
        }
        st.fields = new Set([...(base ? base.fields : []), ...seen]);
        for (const need of ["balance", "rate", "amortization", "term"]) if (!st.fields.has(need))
          throw new RenewError(JSON.stringify(st.name) + " needs a " + need + " setting.", st.line, st.col, "Add an indented line such as " + { balance: "balance $412,500", rate: "rate 4.79%", amortization: "amortization 20 years", term: "term 5 years" }[need] + ".");
        plans.set(st.name, st); order.push(st.name);
        if (st.s === "mortgage") lastMortgage = st.name;
      } else if (st.s === "let") {
        if (vars.has(st.name)) throw new RenewError(JSON.stringify(st.name) + " already has a value. Renew names are set once.", st.line, st.col);
        vars.set(st.name, typeOf(st.expr));
      } else if (st.s === "compare") {
        for (const pn of st.plans || []) if (!plans.has(pn.name)) throw new RenewError("There is no mortgage or scenario named " + JSON.stringify(pn.name) + ".", st.line, pn.col, suggest(pn.name, [...plans.keys()]));
        if (!(st.plans || order).length) throw new RenewError("There is nothing to compare yet.", st.line, st.col);
        st.planNames = st.plans ? st.plans.map((x) => x.name) : order.slice();
        st.metricList = st.metrics || ["payment", "interest", "balance", "payoff"];
      } else if (st.s === "show" || st.s === "explain") {
        if (st.plan !== undefined && !plans.has(st.plan)) throw new RenewError("There is no mortgage or scenario named " + JSON.stringify(st.plan) + ".", st.line, st.pcol, suggest(st.plan, [...plans.keys()]));
        if (st.expr) st.t = typeOf(st.expr);
      } else if (st.s === "check") {
        if (typeOf(st.expr) !== "bool") throw new RenewError("check needs a comparison, like payment of \"A\" <= $3,000.", st.line, st.col);
      }
    }
    return prog;
  }

  // ---------- Interpreter ----------
  function exprText(e) {
    switch (e.e) {
      case "lit": return K.show(e.t, e.v);
      case "posted": return "posted " + e.years + " year on " + e.date;
      case "var": return e.name;
      case "metric": return e.m + " of " + JSON.stringify(e.plan);
      case "solve": return e.what + " needed for " + JSON.stringify(e.plan) + " at " + exprText(e.target);
      case "neg": return "-" + exprText(e.a);
      case "call": return e.f + "(" + exprText(e.a) + ", " + exprText(e.b) + ")";
      case "bin": return exprText(e.a) + " " + e.op + " " + exprText(e.b);
      case "cmp": return exprText(e.a) + " " + e.op + " " + exprText(e.b);
    }
  }
  function evalExpr(e, env) {
    switch (e.e) {
      case "lit": return e.v;
      case "posted": return e.found.v;
      case "var": return env.vars.get(e.name);
      case "metric": return K.metric(env.plan(e.plan), e.m);
      case "solve": return K[e.what === "rate" ? "rateNeeded" : "amortizationNeeded"](env.plan(e.plan).spec, evalExpr(e.target, env));
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
  // Money times a percentage is money: $400,000 * 1% is $4,000, so the percentage is scaled by 0.01.
  function percentScale(e) { const a = e.a.ty, b = e.b.ty; return e.op === "*" && ((a === "money" && b === "percent") || (a === "percent" && b === "money")); }

  function resolveSpec(st, specs, env) {
    const base = st.base ? specs.get(st.base) : { compounded: "semi-annually", payments: "monthly", extra: 0, lump: 0 };
    const spec = Object.assign({}, base, { name: st.name, kind: st.s });
    for (const pr of st.props) spec[pr.prop] = pr.expr ? evalExpr(pr.expr, env) : pr.value;
    for (const pr of st.props) if (pr.prop === "rate" && pr.kind) spec.rateKind = pr.kind;
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
  }

  function run(src) {
    const prog = check(parse(src));
    const specs = new Map(), cache = new Map(), blocks = [];
    const env = { vars: new Map(), plan: (n) => { if (!cache.has(n)) cache.set(n, K.plan(specs.get(n))); return cache.get(n); } };
    for (const st of prog) {
      if (st.s === "mortgage" || st.s === "scenario") specs.set(st.name, resolveSpec(st, specs, env));
      else if (st.s === "let") env.vars.set(st.name, evalExpr(st.expr, env));
      else if (st.s === "compare") blocks.push(K.compareBlock(st.planNames.map(env.plan), st.metricList));
      else if (st.s === "show" && st.what === "schedule") blocks.push(K.scheduleBlock(env.plan(st.plan), st.first));
      else if (st.s === "show" && st.what === "yearly") blocks.push(K.yearlyBlock(env.plan(st.plan)));
      else if (st.s === "show") blocks.push({ kind: "value", text: exprText(st.expr) + " = " + K.show(st.t, evalExpr(st.expr, env)) });
      else if (st.s === "explain") blocks.push(K.explainBlock(env.plan(st.plan)));
      else if (st.s === "check") {
        const e = st.expr;
        blocks.push({ kind: "check", pass: evalExpr(e, env), text: exprText(e) + "  (" + K.show(e.ct, evalExpr(e.a, env)) + " " + e.op + " " + K.show(e.ct, evalExpr(e.b, env)) + ")", line: st.line });
      }
    }
    return { blocks, text: K.renderText(blocks), plans: [...specs.keys()].map((n) => env.plan(n)) };
  }

  // ---------- Compiler: Renew to a standalone JavaScript program ----------
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
    out.push("// Compiled by renewc from a Renew program. Runs on its own with Node 18 or newer, or in a browser.");
    out.push("// Rate maths: blended payments with the rate compounded as stated (the Interest Act, s. 6, statement convention is half yearly).");
    out.push('"use strict";');
    out.push("const K = (" + kernelFactory.toString() + ")();");
    out.push("const blocks = [];");
    out.push("function div(a, b, line) { if (b === 0) throw new Error(\"Line \" + line + \": this divides by zero.\"); return a / b; }");
    out.push("function lazy(spec) { let p = null; return () => p || (p = K.plan(spec())); }");
    let k = 0;
    for (const st of prog) {
      out.push("// line " + st.line + ": " + st.s + (st.name ? " " + J(st.name) : ""));
      if (st.s === "mortgage" || st.s === "scenario") {
        const id = "plan" + k++; ids.set(st.name, id);
        const parts = [];
        const base = st.base ? planId(st.base) + "().spec" : J({ compounded: "semi-annually", payments: "monthly", extra: 0, lump: 0 });
        for (const pr of st.props) parts.push(J(pr.prop) + ": " + (pr.expr ? lower(pr.expr) : J(pr.value)));
        out.push("const " + id + " = lazy(() => check(Object.assign({}, " + base + ", { name: " + J(st.name) + ", " + parts.join(", ") + " }), " + st.line + "));");
      } else if (st.s === "let") out.push("const v_" + st.name.replace(/-/g, "_") + " = " + lower(st.expr) + ";");
      else if (st.s === "compare") out.push("blocks.push(K.compareBlock([" + st.planNames.map((n) => planId(n) + "()").join(", ") + "], " + J(st.metricList) + "));");
      else if (st.s === "show" && st.what === "schedule") out.push("blocks.push(K.scheduleBlock(" + planId(st.plan) + "(), " + (st.first || 0) + "));");
      else if (st.s === "show" && st.what === "yearly") out.push("blocks.push(K.yearlyBlock(" + planId(st.plan) + "()));");
      else if (st.s === "show") out.push("blocks.push({ kind: \"value\", text: " + J(exprText(st.expr) + " = ") + " + K.show(" + J(st.t) + ", " + lower(st.expr) + ") });");
      else if (st.s === "explain") out.push("blocks.push(K.explainBlock(" + planId(st.plan) + "()));");
      else if (st.s === "check") {
        const e = st.expr;
        out.push("blocks.push({ kind: \"check\", pass: " + lower(e) + ", text: " + J(exprText(e) + "  (") + " + K.show(" + J(e.ct) + ", " + lower(e.a) + ") + " + J(" " + e.op + " ") + " + K.show(" + J(e.ct) + ", " + lower(e.b) + ") + \")\", line: " + st.line + " });");
      }
    }
    // validation mirrors validateSpec so compiled programs refuse the same bad plans
    out.splice(6, 0, "function check(s, line) { const bad = (m) => { throw new Error(\"Line \" + line + \": \" + m); }; if (!(s.balance > 0)) bad(\"The balance must be more than $0.\"); if (!(s.rate >= 0 && s.rate < 100)) bad(\"The rate must be between 0% and 100%.\"); if (!(s.amortization >= 1 && s.amortization <= 600)) bad(\"The amortization must be between 1 month and 50 years.\"); if (!(s.term >= 1 && s.term <= s.amortization)) bad(\"The term must be at least 1 month and no longer than the amortization.\"); if (s.extra < 0 || s.lump < 0) bad(\"Extra payments cannot be negative.\"); return s; }");
    out.push("const report = K.renderText(blocks);");
    out.push("if (typeof module !== \"undefined\" && module.exports) module.exports = { blocks, report };");
    out.push("if (typeof require !== \"undefined\" && typeof module !== \"undefined\" && require.main === module) process.stdout.write(report);");
    return out.join(NL) + NL;
  }

  function formatError(err, src) {
    if (!(err instanceof RenewError)) return String(err && err.message || err);
    const line = String(src).replace(/\r\n?/g, NL).split(NL)[err.line - 1] || "";
    return "Line " + err.line + ", column " + err.col + ": " + err.message + NL + "  " + line + NL + "  " + " ".repeat(Math.max(0, err.col - 1)) + "^" + (err.hint ? NL + "  " + err.hint : "");
  }

  const api = { lex, parse, check, run, compile, formatError, RenewError, kernel: K, posted: POSTED, METRICS, FREQS, TOP, PROPS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Renew = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
