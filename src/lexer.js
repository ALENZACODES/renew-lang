// Lexer for the Renew language. John Khan, Toronto, Ontario.
(function (root) {
  "use strict";
  function renewLexer(C) {
    const { NL, RenewError, parseNum } = C;
  const CONTINUE = ["by", "over", "against", "then"];
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
      if (!toks.length) return;
      // Line continuation: a line that ends with a comma goes on to the next line, and so does a line
      // followed by an indented line that starts with by, over, against or then.
      const prev = out[out.length - 1];
      const first = toks[0];
      const lastOfPrev = prev && prev.toks[prev.toks.length - 1];
      if (prev && (lastOfPrev.k === "op" && lastOfPrev.v === "," || indent && first.k === "word" && CONTINUE.includes(first.v))) {
        prev.toks.push(...toks); prev.lines = (prev.lines || [prev.line]).concat([line]); return;
      }
      out.push({ line, indent, toks, text });
    });
    return out;
  }
    return { lex };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = renewLexer;
  root.renewLexer = renewLexer;
})(typeof globalThis !== "undefined" ? globalThis : this);
