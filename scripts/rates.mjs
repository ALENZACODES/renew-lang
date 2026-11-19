// npm run rates: download the Bank of Canada weekly conventional mortgage rates again and rebuild
// data/posted_rates.json, data/boc_conventional_mortgage_2016_2026.csv and src/posted_rates.js.
// Source: Bank of Canada Valet API, series V80691333 (1 year), V80691334 (3 year) and V80691335 (5 year).
// Terms of use: https://www.bankofcanada.ca/terms/
// Run it with no arguments to download, or with a saved CSV file to rebuild from that file without the network.
import { readFileSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

export const SERIES = { 1: "V80691333", 3: "V80691334", 5: "V80691335" };
export const URL_CSV = "https://www.bankofcanada.ca/valet/observations/" + Object.values(SERIES).join(",") + "/csv?start_date=2016-01-01";

const cells = (line) => [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);

// Reads the Valet CSV. Refuses anything that does not look like the three series, so a changed or broken
// download stops the update instead of replacing good rates with bad ones.
export function parseValetCsv(text, retrieved) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === '"OBSERVATIONS"');
  if (start < 0) throw new Error("No OBSERVATIONS section in the download. Nothing was changed.");
  const head = cells(lines[start + 1]);
  const want = ["date", SERIES[1], SERIES[3], SERIES[5]];
  if (head.join(",") !== want.join(",")) throw new Error("Unexpected columns " + head.join(", ") + ". Nothing was changed.");
  const out = { dates: [], 1: [], 3: [], 5: [] };
  for (const l of lines.slice(start + 2)) {
    if (!l.trim()) break;
    const c = cells(l);
    if (c.length !== 4 || !/^\d{4}-\d{2}-\d{2}$/.test(c[0])) throw new Error("Unexpected row " + l + ". Nothing was changed.");
    const v = c.slice(1).map(Number);
    if (v.some((x) => !(x > 0 && x < 30))) throw new Error("A rate outside 0% to 30% on " + c[0] + ". Nothing was changed.");
    if (out.dates.length && c[0] <= out.dates[out.dates.length - 1]) throw new Error("Dates are not in order at " + c[0] + ". Nothing was changed.");
    out.dates.push(c[0]); out[1].push(v[0]); out[3].push(v[1]); out[5].push(v[2]);
  }
  if (out.dates.length < 52) throw new Error("Only " + out.dates.length + " weeks in the download. Nothing was changed.");
  return {
    source: "Bank of Canada, Valet API, series V80691333, V80691334 and V80691335 (Conventional mortgage, 1-year, 3-year and 5-year. The Bank describes each as the interest rate for a 1-year, 3-year or 5-year conventional mortgage offered by chartered banks in Canada). Weekly, percent.",
    url: URL_CSV, terms: "https://www.bankofcanada.ca/terms/", retrieved, retrieved_zone: "America/Toronto",
    series: { 1: SERIES[1], 3: SERIES[3], 5: SERIES[5] }, dates: out.dates, 1: out[1], 3: out[3], 5: out[5],
  };
}

// Keeps the key order of the file (source first, then the three rate lists), which JSON.stringify would not,
// because it always puts number-like keys such as "1" first.
export function tableJson(t) {
  return "{" + ["source", "url", "terms", "retrieved", "retrieved_zone", "series", "dates", "1", "3", "5"].map((k) => JSON.stringify(k) + ":" + JSON.stringify(t[k])).join(",") + "}";
}

export function torontoDate(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

async function main() {
  const file = process.argv[2];
  let raw;
  if (file) raw = readFileSync(file);
  else {
    const res = await fetch(URL_CSV);
    if (!res.ok) throw new Error("The Bank of Canada answered " + res.status + ". Nothing was changed.");
    raw = Buffer.from(await res.arrayBuffer());
  }
  const table = parseValetCsv(raw.toString("utf8").replace(/^\uFEFF/, ""), torontoDate(new Date()));
  writeFileSync(new URL("../data/boc_conventional_mortgage_2016_2026.csv", import.meta.url), raw);
  writeFileSync(new URL("../data/posted_rates.json", import.meta.url), tableJson(table));
  execFileSync(process.execPath, [fileURLToPath(new URL("./make_posted.mjs", import.meta.url))], { stdio: "inherit" });
  console.log("posted rates now run from " + table.dates[0] + " to the week of " + table.dates[table.dates.length - 1]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e.message); process.exit(1); });
