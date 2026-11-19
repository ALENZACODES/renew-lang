/* Renew playground, John Khan. Everything runs in this page. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const ed = $("editor"), hl = $("highlight"), gutter = $("gutter");
  const NL = String.fromCharCode(10);
  const KW = new Set(Renew.TOP.concat(["from", "all", "by", "of", "first", "schedule", "yearly", "posted", "on", "needed", "for", "at", "per", "payment", "every", "year", "years", "month", "months", "fixed", "variable", "remaining", "min", "max", "yes", "no", "over", "to", "step"]));
  const SETTINGS = new Set(Renew.PROPS);
  let errLine = 0, lastJS = "", timer = null;

  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function highlightLine(line) {
    let out = "", i = 0;
    const rules = [
      [/^#.*/, "c-com"], [/^"[^"]*"?/, "c-str"], [/^\d{4}-\d{2}-\d{2}/, "c-date"], [/^\$\d[\d,]*(\.\d+)?/, "c-money"],
      [/^\d[\d,]*(\.\d+)?%/, "c-pct"], [/^\d[\d,]*(\.\d+)?/, "c-num"], [/^[A-Za-z_][A-Za-z_-]*/, "word"], [/^(<=|>=|==|!=|[-+*\/(),=<>])/, "c-op"]
    ];
    while (i < line.length) {
      const rest = line.slice(i);
      if (/^\s/.test(rest)) { const m = /^\s+/.exec(rest)[0]; out += m; i += m.length; continue; }
      let hit = false;
      for (const [re, cls] of rules) {
        const m = re.exec(rest);
        if (!m) continue;
        let c = cls;
        if (cls === "word") { const w = m[0].toLowerCase(); c = SETTINGS.has(w) ? "c-set" : KW.has(w) || Renew.METRICS.includes(w) || Renew.FREQS.includes(w) ? "c-kw" : "c-id"; }
        out += '<span class="' + c + '">' + esc(m[0]) + "</span>"; i += m[0].length; hit = true; break;
      }
      if (!hit) { out += esc(line[i]); i++; }
    }
    return out;
  }
  function paint() {
    const lines = ed.value.split(NL);
    hl.innerHTML = lines.map((l, k) => '<span class="ln' + (k + 1 === errLine ? " err-line" : "") + '">' + highlightLine(l) + " </span>").join(NL) + NL;
    gutter.textContent = lines.map((_, k) => String(k + 1)).join(NL);
    syncScroll();
  }
  function syncScroll() { hl.scrollTop = ed.scrollTop; hl.scrollLeft = ed.scrollLeft; gutter.scrollTop = ed.scrollTop; }

  function table(b) {
    const h = '<div class="tbl-wrap" tabindex="0" role="region" aria-label="' + esc(b.title) + '"><table><caption>' + esc(b.title) + "</caption><thead><tr>" + b.columns.map((c) => '<th scope="col">' + esc(c) + "</th>").join("") + "</tr></thead><tbody>";
    const notes = (b.notes || []).map((n) => '<p class="note"><strong>Note.</strong> ' + esc(n) + "</p>").join("");
    return h + b.rows.map((r) => "<tr>" + r.map((c, j) => (j === 0 ? '<th scope="row">' : "<td>") + esc(String(c)) + (j === 0 ? "</th>" : "</td>")).join("") + "</tr>").join("") + "</tbody></table></div>" + notes;
  }
  function renderBlocks(blocks) {
    if (!blocks.length) return '<p class="empty">The program ran. Add compare, show, explain or check to see results.</p>';
    return blocks.map((b) => {
      if (b.kind === "table") return table(b);
      if (b.kind === "explain") return '<div class="explain"><h3>' + esc(b.title) + "</h3><ol>" + b.lines.map((l) => "<li>" + esc(l) + "</li>").join("") + "</ol></div>";
      if (b.kind === "check") return '<p class="check ' + (b.pass ? "pass" : "fail") + '"><strong>' + (b.pass ? "PASS" : "FAIL") + "</strong> <span>" + esc(b.text) + "</span> <small>line " + b.line + "</small></p>";
      return '<p class="value">' + esc(b.text) + "</p>";
    }).join("");
  }
  function astView(prog) {
    return JSON.stringify(prog, (k, v) => (["found", "fields", "planNames", "metricList", "ty", "ncol", "pcol", "fcol", "ocol", "propCol"].includes(k) ? undefined : v), 2);
  }
  function run() {
    const src = ed.value;
    try {
      const res = Renew.run(src);
      errLine = 0;
      $("view-report").innerHTML = renderBlocks(res.blocks);
      lastJS = Renew.compile(src);
      $("js-out").textContent = lastJS;
      $("ast-out").textContent = astView(Renew.parse(src));
      const fails = res.blocks.filter((b) => b.kind === "check" && !b.pass).length;
      $("status").textContent = "Ran " + res.plans.length + " plan" + (res.plans.length === 1 ? "" : "s") + (fails ? ", " + fails + " check" + (fails === 1 ? "" : "s") + " failed" : "") + ".";
      $("status").className = "status " + (fails ? "warn" : "good");
    } catch (e) {
      errLine = e.line || 0;
      const msg = Renew.formatError(e, src);
      $("view-report").innerHTML = '<div class="error" role="alert"><h3>Line ' + (e.line || "?") + "</h3><pre>" + esc(msg) + '</pre><button type="button" class="ghost" id="goto-err">Go to line ' + (e.line || 1) + "</button></div>";
      const g = $("goto-err"); if (g) g.addEventListener("click", () => gotoLine(e.line, e.col));
      $("status").textContent = "Line " + (e.line || "?") + ": " + e.message;
      $("status").className = "status bad";
      lastJS = "";
      $("js-out").textContent = "Fix the error to compile.";
    }
    paint();
  }
  function gotoLine(line, col) {
    const lines = ed.value.split(NL); let pos = 0;
    for (let k = 0; k < line - 1 && k < lines.length; k++) pos += lines[k].length + 1;
    pos += Math.max(0, (col || 1) - 1);
    ed.focus(); ed.setSelectionRange(pos, pos);
  }
  function load(src) { ed.value = src; run(); }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function toB64(s) { return btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function fromB64(s) { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/")); return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0))); }

  // Tabs with arrow keys
  const tabs = ["tab-report", "tab-js", "tab-ast"].map($);
  function selectTab(t) {
    tabs.forEach((x) => { const on = x === t; x.setAttribute("aria-selected", String(on)); x.tabIndex = on ? 0 : -1; $(x.getAttribute("aria-controls")).hidden = !on; });
  }
  tabs.forEach((t, k) => {
    t.addEventListener("click", () => selectTab(t));
    t.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const n = tabs[(k + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; selectTab(n); n.focus(); e.preventDefault(); }
    });
  });

  const sel = $("example");
  RENEW_EXAMPLES.forEach((x, k) => { const o = document.createElement("option"); o.value = String(k); o.textContent = x.file.replace(/\.renew$/, "").replace(/^\d+-/, "").replace(/-/g, " "); sel.appendChild(o); });
  sel.addEventListener("change", () => load(RENEW_EXAMPLES[Number(sel.value)].source));
  ed.addEventListener("input", () => { paint(); clearTimeout(timer); timer = setTimeout(run, 350); });
  ed.addEventListener("scroll", syncScroll);
  ed.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); } });
  $("run").addEventListener("click", run);
  $("download").addEventListener("click", () => download("plan.renew", ed.value, "text/plain"));
  $("download-js").addEventListener("click", () => { if (lastJS) download("plan.js", lastJS, "text/javascript"); });
  $("share").addEventListener("click", async () => {
    const url = location.origin + location.pathname + "#p=" + toB64(ed.value);
    history.replaceState(null, "", url);
    try { await navigator.clipboard.writeText(url); $("status").textContent = "Share link copied. The program lives in the link, not on a server."; }
    catch (e) { $("status").textContent = "The share link is now in the address bar."; }
  });
  const m = /#p=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (m) { try { load(fromB64(m[1])); } catch (e) { load(RENEW_EXAMPLES[0].source); } } else load(RENEW_EXAMPLES[0].source);
})();
