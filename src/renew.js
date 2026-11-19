// Renew: a small language for Canadian mortgage renewal decisions. John Khan, Toronto, Ontario.
// Pipeline: source -> lex -> parse (AST) -> check (names and types) -> run (interpreter) or compile (JavaScript).
// The stages live in lexer.js, parser.js, checker.js, interpreter.js and compiler.js. This file wires them
// and is the public API, in Node and in the browser.
(function (root) {
  "use strict";
  const kernelFactory = typeof renewKernel !== "undefined" ? renewKernel : require("./kernel.js");
  const POSTED = typeof RENEW_POSTED !== "undefined" ? RENEW_POSTED : require("./posted_rates.js");
  const C = typeof RenewCommon !== "undefined" ? RenewCommon : require("./common.js");
  const K = kernelFactory();
  const { lex } = (typeof renewLexer !== "undefined" ? renewLexer : require("./lexer.js"))(C);
  const lang = (typeof renewParser !== "undefined" ? renewParser : require("./parser.js"))(C, lex, K);
  const { parse, METRICS, FREQS, TOP, PROPS, SWEEPABLE } = lang;
  const { check } = (typeof renewChecker !== "undefined" ? renewChecker : require("./checker.js"))(C, K, POSTED);
  const interp = (typeof renewInterpreter !== "undefined" ? renewInterpreter : require("./interpreter.js"))(C, K, parse, check);
  const { run, inputsOf } = interp;
  const { compile } = (typeof renewCompiler !== "undefined" ? renewCompiler : require("./compiler.js"))(C, K, parse, check, interp, kernelFactory);
  const { NL, RenewError } = C;
  function formatError(err, src) {
    if (!(err instanceof RenewError)) return String(err && err.message || err);
    const line = String(src).replace(/\r\n?/g, NL).split(NL)[err.line - 1] || "";
    return "Line " + err.line + ", column " + err.col + ": " + err.message + NL + "  " + line + NL + "  " + " ".repeat(Math.max(0, err.col - 1)) + "^" + (err.hint ? NL + "  " + err.hint : "");
  }

  const api = { lex, parse, check, run, compile, inputsOf, formatError, RenewError, kernel: K, posted: POSTED, METRICS, FREQS, TOP, PROPS, SWEEPABLE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.Renew = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
