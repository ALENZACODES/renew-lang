// Parser for the Renew language. John Khan, Toronto, Ontario.
(function (root) {
  "use strict";
  function renewParser(C, lex, K) {
    const { RenewError, suggest } = C;
  const TOP = ["mortgage", "scenario", "let", "input", "compare", "sweep", "show", "explain", "check"];
  const RESERVED = ["then", "after", "remaining", "fit", "break", "even", "against", "over", "by", "trigger"];
  const PROPS = ["balance", "rate", "compounded", "amortization", "payments", "term", "extra", "lump", "renews"];
  const SWEEPABLE = ["rate", "balance", "amortization", "term", "extra", "lump", "renews"];
  const MULTI = ["renewal payment", "three months interest", "trigger rate"];
  const METRICS = Object.keys(K.METRIC).filter((m) => !MULTI.includes(m)).concat(MULTI);
  const TOTAL_HINT = "Renew calls everything paid paid, to match the report. Write paid instead of total.";
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
        if (t.v === "break" && this.isWord("even", 1)) {
          // break even SETTING for "A" against "B" by interest over 5 years, where SETTING is any setting a sweep
          // can change: rate, balance, amortization, term, extra, lump or renews.
          const hint = 'Write break even renews for "Offered 1 year" against "Offered 5 year" by interest over 5 years. The setting can be ' + SWEEPABLE.join(", ") + ".";
          this.next(); this.next();
          const sw = this.peek();
          if (!sw || sw.k !== "word" || !SWEEPABLE.includes(sw.v)) this.fail("break even changes one setting: " + SWEEPABLE.join(", ") + ".", suggest(sw && sw.v, SWEEPABLE) || hint);
          // Short form (round 8): break even renews "A" vs "B" by interest over 5 years. "for" may be left out
          // and "vs" may stand for "against"; the long form still works.
          const prop = this.next().v; if (this.isWord("for")) this.next();
          const a = this.string("plan that renews"); if (this.isWord("vs")) this.next(); else this.word("against", hint + ' Or the short form: break even renews "Offered 1 year" vs "Offered 5 year" by interest over 5 years.'); const b = this.string("plan to match");
          this.word("by", hint); const m = this.peek();
          if (!m || m.k !== "word" || !["interest", "paid"].includes(m.v)) this.fail("break even works by interest or paid.", hint);
          this.next(); this.word("over", hint);
          return { e: "breakeven", prop: prop, plan: a.v, pcol: a.col, ref: b.v, rcol: b.col, m: m.v, over: this.additive(), line: t.line, col: t.col };
        }
        if (t.v === "renewal" && this.isWord("payment", 1) && this.isWord("of", 2)) {
          this.next(); this.next(); this.next();
          const s = this.string("plan"); return { e: "metric", m: "renewal payment", plan: s.v, line: t.line, col: t.col, pcol: s.col };
        }
        if (t.v === "trigger" && this.isWord("rate", 1) && this.isWord("of", 2)) {
          this.next(); this.next(); this.next();
          const s = this.string("plan"); return { e: "metric", m: "trigger rate", plan: s.v, line: t.line, col: t.col, pcol: s.col };
        }
        if (t.v === "total" && this.isWord("of", 1)) this.fail("total is not a Renew measure.", TOTAL_HINT);
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
    } else if (t.v === "amortization" && p.isWord("to") && p.isWord("fit", 1)) {
      // amortization to fit $2,848.54: the shortest amortization whose payment fits, from this plan's settings.
      p.next(); p.next(); prop.fit = p.expr();
    } else if (t.v === "amortization" && p.isWord("remaining")) {
      // amortization remaining from "Plan": that plan's amortization minus its term.
      p.next(); p.word("from", 'Write amortization remaining from "Signed in 2021".'); const s = p.string("plan the amortization is left over from");
      prop.remainingFrom = s.v; prop.rcol = s.col;
    } else {
      if (t.v === "renews") p.word("at", "Write renews at 5.25%, the rate to use after the term.");
      prop.expr = p.expr();
      // A rate path: rate 5.2% then 4.7% after 12 months. Each after counts from when the previous rate started.
      if (t.v === "rate" && (p.isWord("fixed") || p.isWord("variable"))) { const kt = p.next(); prop.kind = kt.v; prop.kline = kt.line; prop.kcol = kt.col; }
      if (t.v === "rate" || t.v === "renews") {
        prop.path = [];
        while (p.isWord("then")) {
          const th = p.next(); const r = p.additive();
          p.word("after", "Write then 4.7% after 12 months: the new rate, then how long after the previous one it starts.");
          prop.path.push({ rate: r, after: p.additive(), line: th.line, col: th.col });
        }
      }
      if (t.v === "rate" && !prop.kind && (p.isWord("fixed") || p.isWord("variable"))) { const kt = p.next(); prop.kind = kt.v; prop.kline = kt.line; prop.kcol = kt.col; }
      // payment held: a variable rate whose payment stays the same when the rate changes.
      // payment fixed is the old spelling and is refused with a hint.
      if (t.v === "rate" && p.isWord("payment") && p.isWord("fixed", 1)) {
        const pt = p.next(); p.next();
        throw new RenewError("payment fixed was renamed. Write payment held.", pt.line, pt.col, "Write rate 4.2% variable then 5.5% after 6 months payment held.");
      }
      if (t.v === "rate" && p.isWord("payment") && p.isWord("held", 1)) {
        const pt = p.next(); p.next(); prop.paymentHeld = true; prop.hline = pt.line; prop.hcol = pt.col;
        if (prop.kind === "fixed") throw new RenewError("payment held is for a variable rate. A fixed rate keeps the same payment for the term anyway.", pt.line, pt.col, "Write rate 4.2% variable then 5.5% after 6 months payment held.");
      }
      if (t.v === "rate" && !prop.kind && prop.paymentHeld) { prop.kind = "variable"; prop.kline = prop.hline; prop.kcol = prop.hcol; }
      // A rate that changes inside the term is a variable rate, so a path with no label is marked variable.
      if (t.v === "rate" && !prop.kind && prop.path.length) { prop.kind = "variable"; prop.kindFromPath = true; }
      if (t.v === "extra") { p.word("per", 'Write extra $200 per payment.'); p.word("payment", 'Write extra $200 per payment.'); }
      if (t.v === "lump") { p.word("every", 'Write lump $5,000 every year.'); p.word("year", 'Write lump $5,000 every year.'); }
      if (t.v === "amortization" && p.isWord("remaining")) p.fail("remaining needs a plan: write amortization remaining from \"Name\", which is that plan's amortization minus its term.", "Or leave the word out: amortization 20 years means 20 years from the start of this plan.");
    }
    p.done();
    return prop;
  }

  function parseMeasures(p) {
    const list = [];
    do {
      const w = p.peek();
      if (w && w.v === "three" && p.isWord("months", 1)) { p.next(); p.next(); p.word("interest"); list.push("three months interest"); continue; }
      if (w && w.v === "renewal" && p.isWord("payment", 1)) { p.next(); p.next(); list.push("renewal payment"); continue; }
      if (w && w.v === "trigger" && p.isWord("rate", 1)) { p.next(); p.next(); list.push("trigger rate"); continue; }
      if (w && w.v === "total") p.fail("total is not a Renew measure.", TOTAL_HINT);
      if (!w || !K.METRIC[w.v]) p.fail("Unknown measure " + JSON.stringify(w && (w.raw || w.v)) + ".", suggest(w && w.v, METRICS) || "Measures are: " + METRICS.join(", ") + ".");
      list.push(p.next().v);
    } while (p.isOp(",") && p.next());
    return list;
  }
  function parseOver(p, st) {
    if (p.isWord("over")) { const o = p.next(); st.over = p.additive(); st.ocol = o.col; }
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
      } else if (t.v === "let" || t.v === "input") {
        const n = p.next();
        if (!n || n.k !== "word") p.i--, p.fail("Expected a name after " + t.v + ".", "For example: " + t.v + " budget = $2,900");
        if (TOP.includes(n.v) || PROPS.includes(n.v) || RESERVED.includes(n.v) || K.METRIC[n.v]) throw new RenewError(JSON.stringify(n.v) + " is a Renew word and cannot be a name.", n.line, n.col);
        if (!p.isOp("=")) p.fail("Expected = after the name."); p.next();
        st.name = n.v; st.expr = p.expr(); p.done();
      } else if (t.v === "compare") {
        st.plans = null; st.metrics = null;
        if (p.isWord("all")) p.next();
        else if (p.peek() && p.peek().k === "string") {
          st.plans = [];
          do { const s = p.string("plan"); st.plans.push({ name: s.v, col: s.col }); } while (p.isOp(",") && p.next());
        }
        if (p.isWord("by")) { p.next(); st.metrics = parseMeasures(p); }
        parseOver(p, st);
        p.done();
      } else if (t.v === "sweep") {
        const s = p.string("plan"); st.plan = s.v; st.pcol = s.col;
        const w = p.peek();
        if (!w || w.k !== "word" || !SWEEPABLE.includes(w.v)) p.fail("A sweep changes one setting: " + SWEEPABLE.join(", ") + ".", suggest(w && w.v, SWEEPABLE) || 'For example: sweep "Renewal" rate from 4% to 7% step 0.5%');
        st.prop = p.next().v; st.propCol = w.col;
        p.word("from", 'For example: sweep "Renewal" rate from 4% to 7% step 0.5%'); st.from = p.additive();
        p.word("to", "Then the last value, like to 7%."); st.to = p.additive();
        p.word("step", "Then the step, like step 0.5%."); st.step = p.additive();
        st.metrics = null;
        if (p.isWord("by")) { p.next(); st.metrics = parseMeasures(p); }
        parseOver(p, st);
        if (p.isWord("against")) { p.next(); const r = p.string("plan to compare against"); st.against = r.v; st.acol = r.col; }
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
    return { parse, TOP, RESERVED, PROPS, SWEEPABLE, MULTI, METRICS, TOTAL_HINT, FREQS };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = renewParser;
  root.renewParser = renewParser;
})(typeof globalThis !== "undefined" ? globalThis : this);
