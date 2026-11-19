// Shared helpers for the Renew language pipeline. John Khan, Toronto, Ontario.
(function (root) {
  "use strict";
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
  function parseNum(s, line, col) {
    if (/,/.test(s) && !/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(s)) throw new RenewError("Commas in " + s + " must group thousands, like 412,500.", line, col);
    return Number(s.replace(/,/g, ""));
  }

  const api = { NL, RenewError, editDistance, suggest, parseNum };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.RenewCommon = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
