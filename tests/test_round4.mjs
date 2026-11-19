// Round 4: rate paths inside the term, renewal paths, break even, amortization to fit, amortization remaining from,
// continuation lines, input declarations, compile --module, and npm run rates.
// Figures marked (independent) were worked out separately in Python with the same rounding rule
// (interest = balance x periodic rate, rounded to the cent; payment recomputed at each change over what is left).
import { Renew, eq, ok, near, throwsAt, done, root, require } from "./helpers.mjs";
import { readFileSync, writeFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import vm from "vm";
import { parseValetCsv, tableJson, SERIES } from "../scripts/rates.mjs";
const K = Renew.kernel;
const ex1 = readFileSync(join(root, "examples/01-renewal-2026.renew"), "utf8");
const base = 'mortgage "Base"\n  balance $400,000\n  rate 5%\n  amortization 25 years\n  term 3 years\n';
const paths = base + 'scenario "Var" from "Base"\n  rate 5.2% then 4.7% after 12 months\n' +
  'scenario "Steps" from "Base"\n  term 1 year\n  rate 4%\n  renews at 4.5% then 5% after 1 year\n';
const row = (b, name) => b.rows.find((r) => r[0] === name);

// 1. A rate path inside the term: rate 5.2% then 4.7% after 12 months.
let r = Renew.run(paths + 'compare "Base", "Var", "Steps" by payment, renewal payment, interest, paid, balance over 3 years\nexplain "Var"\nexplain "Steps"');
eq("rate path: first payment (independent)", row(r.blocks[0], "Var")[1], "$2,372.17 monthly");
eq("rate path: payment in force at the end of the term (independent)", row(r.blocks[0], "Var")[2], "$2,262.00 monthly");
eq("rate path: interest over 3 years (independent)", row(r.blocks[0], "Var")[3], "$56,057.51");
eq("rate path: balance after 3 years (independent)", row(r.blocks[0], "Var")[5], "$373,303.47");
ok("rate path explained with its date and new payment", r.blocks[1].lines.includes("Rate path, 1 year from the start: the rate becomes 4.7%. On the balance left, $391,923.48, over the remaining 24 years, the payment becomes $2,262.00."));
ok("a path with no label is treated as variable and says it is one path", r.blocks[0].notes.some((n) => n.includes('"Var" follows the rate path written in the program, 5.2%, then 4.7% after 1 year') && n.includes("one path, not a forecast")));
const v = K.plan(Object.assign({ name: "V", compounded: "semi-annually", payments: "monthly", extra: 0, lump: 0, balance: 400000, rate: 5.2, amortization: 300, term: 36, ratePath: [{ rate: 4.7, after: 12 }] }));
eq("kernel records the change", v.changes.length, 1);
eq("kernel change balance (independent)", v.changes[0].balance, 391923.48);

// 2. A multi step renewal path: renews at 4.5% then 5% after 1 year. Each after counts from the previous change.
eq("renewal path: payment after the first renewal (independent)", row(r.blocks[0], "Steps")[2], "$2,210.27 monthly");
eq("renewal path: interest over 3 years (independent)", row(r.blocks[0], "Steps")[3], "$51,571.25");
eq("renewal path: balance after 3 years (independent)", row(r.blocks[0], "Steps")[5], "$372,014.61");
ok("renewal path second step explained (independent)", r.blocks[2].lines.includes("Renewal path, 2 years from the start: the rate becomes 5%. On the balance left, $381,142.65, over the remaining 23 years, the payment becomes $2,315.37."));
ok("renewal path in the horizon note", r.blocks[0].notes.some((n) => n.includes("renews at 4.5%, then 5% after 1 year (its renews at setting)")));
ok("renewal path in the payoff line", r.blocks[2].lines.some((l) => l.includes("assuming it renews at 4.5%, then 5% after 1 year after this term, and the last rate holds after that")));
// a three step renewal path also runs, and the third step lands 3 years after the first renewal
r = Renew.run(base + 'scenario "S3" from "Base"\n  term 1 year\n  renews at 4.5% then 5% after 1 year then 5.5% after 2 years\nexplain "S3"');
ok("three step renewal path", r.blocks[0].lines.some((l) => l.startsWith("Renewal path, 4 years from the start: the rate becomes 5.5%.")));

// 3. Path errors.
throwsAt("fixed rate with a path", base + 'scenario "V" from "Base"\n  rate 5.2% fixed then 4.7% after 12 months\n', 7, 3, "A fixed rate does not change inside the term");
throwsAt("path step past the term", base + 'scenario "V" from "Base"\n  rate 5.2% then 4.7% after 3 years\n', 7, 3, "Changes after the term belong in renews at");
throwsAt("renewal path past the amortization", base + 'scenario "S" from "Base"\n  renews at 4% then 5% after 30 years\n', 7, 3, "past the amortization of 25 years");
throwsAt("path rate must be a percentage", base + 'scenario "V" from "Base"\n  rate 5.2% then $4 after 12 months\n', 7, 18, "must be a percentage");
throwsAt("path after must be a duration", base + 'scenario "V" from "Base"\n  rate 5.2% then 4% after 12\n', 7, 27, "after 12 months");
throwsAt("then without after", base + 'scenario "V" from "Base"\n  rate 5.2% then 4%\n', 7, 20, "then 4.7% after 12 months");

// 4. Break even: the exact renewal rate where the 1 year offer stops costing less than the 5 year offer.
r = Renew.run(ex1);
const be = r.blocks.find((b) => b.text && b.text.startsWith("break even"));
eq("example 1 break even rate", be.text, 'break even renews for "Offered 1 year, then decide" against "Offered 5 year" by interest over 5 years = 4.889%');
ok("break even note shows both sides of the crossing", be.notes[0].startsWith('Renewing at 4.888%, "Offered 1 year, then decide" has interest over 5 years of $94,162.75, less than "Offered 5 year" at $94,169.01. Renewing at 4.889% it has $94,178.85, which is not less.'));
// The two figures in the note are the same numbers a compare gives at those rates.
const at = (rate) => Renew.run(ex1.replace(/show break even[\s\S]*?over 5 years\n/, "") + '\nscenario "At" from "Renewal"\n  rate posted 1 year on 2026-11-18 - discount fixed\n  term 1 year\n  renews at ' + rate + '%\ncompare "At" by interest over 5 years').blocks.at(-1).rows[0][1];
eq("break even below value matches a compare at 4.888%", at(4.888), "$94,162.75");
eq("break even crossing value matches a compare at 4.889%", at(4.889), "$94,178.85");
const sp = K.plan({ name: "x", compounded: "semi-annually", payments: "monthly", extra: 0, lump: 0, balance: 100000, rate: 4, amortization: 300, term: 12 });
const ref = K.plan({ name: "y", compounded: "semi-annually", payments: "monthly", extra: 0, lump: 0, balance: 100000, rate: 4, amortization: 300, term: 60 });
near("same rate both ways breaks even at that rate", K.breakEven(sp.spec, ref, "interest", 60).rate, 4, 0.0015);
throwsAt("break even needs two plans", base + 'show break even renews for "Base" against "Base" by interest over 5 years\n', 6, 43, "two different plans");
throwsAt("break even needs a horizon longer than the term", base + 'scenario "One" from "Base"\n  term 1 year\nshow break even renews for "Base" against "One" by interest over 3 years\n', 8, null, "horizon longer than the term");
throwsAt("break even refuses a renewal path", paths + 'show break even renews for "Steps" against "Base" by interest over 3 years\n', 12, 28, "cannot have a renewal path");

// 5. amortization to fit and amortization remaining from.
const keep = Renew.run(ex1 + '\nshow payoff of "Keep the old payment"\nshow payoff of "Renewal"').blocks;
eq("fit: shortest amortization that fits the 2021 payment", keep.at(-2).text, 'payoff of "Keep the old payment" = 19 years 9 months');
eq("remaining from: 25 years minus the 5 year term", keep.at(-1).text, 'payoff of "Renewal" = 20 years');
const keepSpec = { name: "k", compounded: "semi-annually", payments: "monthly", extra: 0, lump: 0, balance: 441063.33, rate: 4.69, term: 60 };
ok("fit: one month shorter would not fit", K.plan(Object.assign({}, keepSpec, { amortization: 236 })).payment > 2848.54 && K.plan(Object.assign({}, keepSpec, { amortization: 237 })).payment <= 2848.54);
throwsAt("fit that cannot be reached", base + 'scenario "F" from "Base"\n  amortization to fit $100\n', 7, 23, "No amortization up to 50 years");
throwsAt("fit needs money", base + 'scenario "F" from "Base"\n  amortization to fit 5%\n', 7, 23, "amortization to fit needs the payment");
throwsAt("remaining from needs a real plan", base + 'scenario "F" from "Base"\n  amortization remaining from "Nope"\n', 7, 31, 'no mortgage or scenario named "Nope"');

// 6. Line continuation: a trailing comma, or an indented by, over, against or then, continues the line.
const one = Renew.run(base + 'scenario "B" from "Base"\n  rate 4%\ncompare "Base", "B" by payment, interest over 5 years').text;
eq("comma continuation", Renew.run(base + 'scenario "B" from "Base"\n  rate 4%\ncompare "Base",\n    "B" by payment, interest over 5 years').text, one);
eq("by and over continuation", Renew.run(base + 'scenario "B" from "Base"\n  rate 4%\ncompare "Base", "B"\n    by payment, interest\n    over 5 years').text, one);
eq("then continuation in a rate path", Renew.run(base + 'scenario "V" from "Base"\n  rate 5.2%\n    then 4.7% after 12 months\nexplain "V"').text, Renew.run(paths + 'explain "Var"').text.replace(/Var/g, "V"));
throwsAt("an error on a continued line points at that line", base + 'compare all\n    by payment, bogus\n', 7, 17, 'Unknown measure "bogus"');
throwsAt("an unindented by does not continue", base + 'compare all\nby payment\n', 7, 1, null);

// 7. input declarations: a value the caller can change without editing the program.
eq("inputsOf lists the input", JSON.stringify(Renew.inputsOf(ex1)), JSON.stringify([{ name: "discount", type: "percent", text: "1.5%", line: 14 }]));
const r1 = Renew.run(ex1, { inputs: { discount: "1%" } });
ok("input override changes the answer", r1.text.includes("= 5.388%") && !r1.text.includes("= 4.889%"));
eq("input override with the same value changes nothing", Renew.run(ex1, { inputs: { discount: "1.5%" } }).text, Renew.run(ex1).text);
eq("input given as a number in its unit", Renew.run(ex1, { inputs: { discount: 1 } }).text, r1.text);
try { Renew.run(ex1, { inputs: { discount: "$1" } }); ok("wrong unit refused", false); } catch (e) { ok("wrong unit refused", e.message.includes("must be a percentage") && e.line === 14); }
try { Renew.run(ex1, { inputs: { discont: "1%" } }); ok("unknown input refused", false); } catch (e) { ok("unknown input refused with a suggestion", e.message.includes('no input named "discont"') && (e.hint || "").includes("discount")); }
throwsAt("input must be money, a percentage, a duration or a number", base + 'input when = 2026-11-18\n', 6, null, null);
throwsAt("a Renew word cannot be an input name", 'input then = 5%\n', 1, 7, "is a Renew word");
eq("inputValue percent", K.inputValue("x", "percent", "1.2%"), 1.2);
eq("inputValue money", K.inputValue("x", "money", "$3,000"), 3000);
eq("inputValue duration", K.inputValue("x", "duration", "1 year 6 months"), 18);
eq("inputValue number", K.inputValue("x", "number", "2"), 2);
ok("inputValue refuses another type", (() => { try { K.inputValue("x", "money", {}); return false; } catch (e) { return e.message.includes("must be an amount of money"); } })());

// 8. Compiled code takes inputs too, and compile --module gives an ES module.
function compiled(js, inputs) {
  const sandbox = { module: { exports: {} }, Math, Object, JSON, Number, String, Array, Error, Intl };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(js, sandbox, { timeout: 5000 });
  return inputs ? sandbox.module.exports.run(inputs).report : sandbox.module.exports.report;
}
const js1 = Renew.compile(ex1);
eq("compiled example 1 matches the interpreter", compiled(js1), Renew.run(ex1).text);
eq("compiled run(inputs) matches the interpreter with the same input", compiled(js1, { discount: "1%" }), r1.text);
ok("compiled code lists its inputs", js1.includes('const INPUTS = {"discount":{"type":"percent","default":"1.5%","line":14}};'));
const mjs = Renew.compile(ex1, { module: true });
ok("module mode exports run and inputs", mjs.includes("export { run, INPUTS as inputs };") && !mjs.includes("module.exports"));
const dir = mkdtempSync(join(tmpdir(), "renew4-"));
writeFileSync(join(dir, "ex1.mjs"), mjs);
const mod = await import(join(dir, "ex1.mjs"));
eq("module run() matches the interpreter", mod.run().report, Renew.run(ex1).text);
eq("module run(inputs) matches the interpreter", mod.run({ discount: "1%" }).report, r1.text);
eq("module inputs export", mod.inputs.discount.type, "percent");
const cli = (args) => execFileSync(process.execPath, [join(root, "bin/renew.js"), ...args], { encoding: "utf8" });
writeFileSync(join(dir, "ex1.renew"), ex1);
eq("CLI run --input", cli(["run", join(dir, "ex1.renew"), "--input", "discount=1%"]), r1.text);
eq("CLI compile --module", cli(["compile", join(dir, "ex1.renew"), "--module"]), mjs);
writeFileSync(join(dir, "ex1.js"), js1);
eq("compiled file takes --name=value", execFileSync(process.execPath, [join(dir, "ex1.js"), "--discount=1%"], { encoding: "utf8" }), r1.text);

// 9. Posted rates: the bundle, the update script and the error past the bundle.
const sample = readFileSync(join(root, "tests/fixtures/valet_sample.csv"), "utf8");
const t = parseValetCsv(sample, "2026-11-19");
eq("rates script reads the sample weeks", t.dates.length, 69);
eq("rates script first week", t.dates[0] + " " + t[1][0] + " " + t[3][0] + " " + t[5][0], "2016-01-06 3.14 3.39 4.64");
ok("rates script keeps the series ids", t.series[5] === SERIES[5] && SERIES[5] === "V80691335");
ok("rates script refuses changed columns", (() => { try { parseValetCsv(sample.replace('"date","V80691333"', '"date","V1"'), "x"); return false; } catch (e) { return e.message.includes("Nothing was changed"); } })());
ok("rates script refuses a short download", (() => { try { parseValetCsv(sample.split("\n").slice(0, 30).join("\n"), "x"); return false; } catch (e) { return e.message.includes("Only"); } })());
const bundled = JSON.parse(readFileSync(join(root, "data/posted_rates.json"), "utf8"));
const full = parseValetCsv(readFileSync(join(root, "data/boc_conventional_mortgage_2016_2026.csv"), "utf8").replace(/^\uFEFF/, ""), bundled.retrieved);
eq("the bundled JSON is exactly what the script makes from the bundled CSV", tableJson(full), readFileSync(join(root, "data/posted_rates.json"), "utf8"));
eq("the browser copy holds the same weeks", require(join(root, "src/posted_rates.js")).dates.length, bundled.dates.length);
eq("bundle ends with the week of 2026-11-18", bundled.dates.at(-1), "2026-11-18");
throwsAt("a date past the bundle says how to update", base + 'scenario "P" from "Base"\n  rate posted 5 year on 2027-02-01\n', 7, 8, "npm run rates");
throwsAt("a date before the bundle says what to do", base + 'scenario "P" from "Base"\n  rate posted 5 year on 2015-02-01\n', 7, 8, "Type the rate instead");
ok("npm run rates exists", JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts.rates === "node scripts/rates.mjs");

done("round 4");
