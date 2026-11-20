// The payment after renewal in sweeps, sweeps against a fixed plan, fair comparison notes
// (posted against offered, balances left), variable rate warnings wherever results appear, rate
// differences in percentage points, paid instead of total, and the rebuilt 2026 example. Figures marked
// "independent" were reproduced with a separate Python script using decimal cent rounding.
import { Renew, eq, ok, throwsAt, done, require } from "./helpers.mjs";
const fs = require("fs");
const read = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");

const renewal = 'mortgage "Renewal"\n  balance $441,063.33\n  rate 6.19%\n  amortization 20 years\n  term 5 years\n' +
  'scenario "One year"\n  rate 5.49%\n  term 1 year\n';

// A renews sweep shows the payment after the term, not only the one in it.
const sw = Renew.run(renewal + 'sweep "One year" renews from 4.5% to 6.5% step 0.5% by payment, interest, balance over 5 years').blocks[0];
eq("renews sweep adds the payment after term", sw.columns.join("|"), "Renews|Payment in term|Payment after term|Interest over 5 years|Balance after 5 years");
eq("payment in term is unchanged at 4.5% (independent)", sw.rows[0][1], "$3,016.17 monthly");
eq("payment after renewing at 4.5% (independent)", sw.rows[0][2], "$2,789.75 monthly");
eq("payment after renewing at 6.5% (independent)", sw.rows[4][2], "$3,255.96 monthly");
eq("interest at 4.5% over 5 years (independent)", sw.rows[0][3], "$94,731.72");
ok("sweep explains the two payment columns", sw.notes.some((n) => n.startsWith("Payment in term is the same in every row")));
const asked = Renew.run(renewal + 'sweep "One year" renews from 4.5% to 5% step 0.5% by renewal payment').blocks[0];
eq("renewal payment can be asked for directly", asked.rows[1][1], "$2,903.01 monthly");
eq("renewal payment of a plan", Renew.run(renewal + 'scenario "R" from "Renewal"\n  rate 5.49%\n  term 1 year\n  renews at 6.5%\nshow renewal payment of "R"').blocks[0].text, 'renewal payment of "R" = $3,255.96');
eq("renewal payment without renews at is the same payment", Renew.run(renewal + 'show renewal payment of "One year" - payment of "One year"').blocks[0].text, 'renewal payment of "One year" - payment of "One year" = $0.00');
eq("renewal payment is $0.00 when paid off in the term", Renew.run('mortgage "A"\n  balance $10,000\n  rate 5%\n  amortization 2 years\n  term 2 years\nshow renewal payment of "A"').blocks[0].text, 'renewal payment of "A" = $0.00');
const cmpR = Renew.run(renewal + 'scenario "R" from "Renewal"\n  rate 5.49%\n  term 1 year\n  renews at 6.5%\ncompare "Renewal", "R" by payment, interest over 5 years').blocks[0];
eq("compare adds the payment after term when a plan renews", cmpR.columns.join("|"), "Plan|Payment in term|Payment after term|Interest over 5 years");
eq("compare shows the renewed payment", cmpR.rows[1][2], "$3,255.96 monthly");

// against: one fixed plan under the sweep rows.
const ag = Renew.run(renewal + 'scenario "Five" from "Renewal"\n  rate 4.69%\nsweep "One year" renews from 4.5% to 5% step 0.5% by interest over 5 years against "Five"').blocks[0];
eq("against adds a last row", ag.rows.length, 3);
eq("against row is named", ag.rows[2][0], "Five (for comparison)");
eq("against row figure (independent)", ag.rows[2][1], "$94,169.01");
ok("against is in the title", ag.title.endsWith(', against "Five"'));
throwsAt("against an unknown plan", renewal + 'sweep "One year" renews from 4% to 5% step 1% against "Fiv"', 9, 55, "There is no mortgage or scenario named");

// Posted against typed rates.
const mix = Renew.run('mortgage "P"\n  balance $100,000\n  rate posted 5 year on 2026-11-18\n  amortization 25 years\n  term 5 years\nscenario "T"\n  rate 4.69%\ncompare all by payment').blocks[0];
ok("posted and typed rates in one table are flagged", mix.notes.some((n) => n.startsWith('Some rates here are posted Bank of Canada benchmarks ("P")')));
const allTyped = Renew.run('mortgage "P"\n  balance $100,000\n  rate 5%\n  amortization 25 years\n  term 5 years\nscenario "T"\n  rate 4.69%\ncompare all by payment').blocks[0];
eq("typed rates only, no flag", allTyped.notes.length, 0);
const derived = Renew.run('let d = 1.5%\nmortgage "P"\n  balance $100,000\n  rate posted 5 year on 2026-11-18 - d\n  amortization 25 years\n  term 5 years\nshow rate of "P"').blocks[0];
eq("posted minus a discount is a typed offer", JSON.stringify([derived.text, Renew.run('let d = 1.5%\nmortgage "P"\n  balance $100,000\n  rate posted 5 year on 2026-11-18 - d\n  amortization 25 years\n  term 5 years\nshow rate of "P"').plans[0].spec.rateBasis]), JSON.stringify(['rate of "P" = 4.69%', "typed"]));

// Balances left are accounted for.
const bal = Renew.run(renewal + "compare all by interest, balance over 5 years").blocks[0];
ok("interest and balance over a horizon explain each other", bal.notes.some((n) => n.includes("paid plus balance left equals the starting balance plus interest")));

// Variable rate warnings everywhere results appear.
// Round 8: a bare variable label is refused, so these plans carry renews at, which gives the label something to vary.
const vr = renewal + 'scenario "Var" from "Renewal"\n  rate 5.2% variable\n  renews at 5.5%\n';
const vc = Renew.run(vr + "compare all by payment").blocks[0];
ok("compare warns about a variable plan", vc.notes.some((n) => n.startsWith('Variable rate: "Var" is marked variable, but Renew holds its rate at 5.2% for the whole term.')));
const vs = Renew.run(vr + 'sweep "Var" extra from $0 to $200 step $100').blocks[0];
eq("sweep warns once, not once per row", vs.notes.filter((n) => n.startsWith("Variable rate:")).length, 1);
const vsr = Renew.run(vr + 'sweep "Var" rate from 4% to 6% step 1%').blocks[0];
ok("rate sweep of a variable plan reads as a range", vsr.notes.some((n) => n.includes("read the rows as a range, not a forecast")));
const vv = Renew.run(vr + 'show payment of "Var"');
eq("single value warns", vv.blocks[0].notes.length, 1);
ok("warning is in the text report", vv.text.includes('Note: Variable rate: "Var" is marked variable'));
eq("fixed plan value has no warning", Renew.run(renewal + 'show payment of "Renewal"').blocks[0].notes.length, 0);
// Round 8: variable with nothing to vary is refused at the word variable, with three ways out.
throwsAt("bare variable is refused", renewal + 'scenario "Bare" from "Renewal"\n  rate 5.2% variable\nshow payment of "Bare"\n', 10, 13, "the label would change nothing in the maths");
throwsAt("bare variable hint names a rate path, renews at and a sweep", renewal + 'scenario "Bare" from "Renewal"\n  rate 5.2% variable\n', 10, 13, 'add sweep "Bare" rate from 4% to 6% step 0.5%');
eq("variable with a sweep of that plan runs", Renew.run(renewal + 'scenario "Bare" from "Renewal"\n  rate 5.2% variable\nsweep "Bare" rate from 4% to 6% step 1%\n').blocks.length, 1);
eq("variable with renews at runs", Renew.run(renewal + 'scenario "Bare" from "Renewal"\n  rate 5.2% variable\n  renews at 5%\nshow payment of "Bare"\n').blocks.length, 1);
eq("variable with a rate path runs", Renew.run(renewal + 'scenario "Bare" from "Renewal"\n  rate 5.2% variable then 4.7% after 12 months\nshow payment of "Bare"\n').blocks.length, 1);
eq("fixed with nothing to vary still runs", Renew.run(renewal + 'scenario "Bare" from "Renewal"\n  rate 5.2% fixed\nshow payment of "Bare"\n').blocks.length, 1);
throwsAt("a scenario that inherits a bare variable label is refused too", 'mortgage "M"\n  balance $100,000\n  rate 5% variable\n  amortization 25 years\n  term 5 years\nsweep "M" rate from 4% to 6% step 1%\nscenario "S" from "M"\n  term 3 years\n', 3, 11, '"S" is marked variable');
// Round 9: only something that changes the rate counts. A sweep of another setting does not, nor does payment held.
throwsAt("variable with only a balance sweep is refused", renewal + 'scenario "Bare" from "Renewal"\n  rate 5.2% variable\nsweep "Bare" balance from $400,000 to $500,000 step $50,000\n', 10, 13, "the label would change nothing in the maths");
throwsAt("variable with only a term sweep is refused", renewal + 'scenario "Bare" from "Renewal"\n  rate 5.2% variable\nsweep "Bare" term from 1 year to 5 years step 1 year\n', 10, 13, "does not change the rate");
throwsAt("variable with an extra sweep is refused", renewal + 'scenario "Bare" from "Renewal"\n  rate 5.2% variable\nsweep "Bare" extra from $0 to $200 step $100\n', 10, 13, "nothing in the program changes its rate");
throwsAt("variable with payment held and no rate change is refused", renewal + 'scenario "Bare" from "Renewal"\n  rate 5.2% variable payment held\n', 10, 13, "nothing in the program changes its rate");
eq("variable with a renews sweep runs", Renew.run(renewal + 'scenario "Bare" from "Renewal"\n  rate 5.2% variable\nsweep "Bare" renews from 4% to 6% step 1%\n').blocks.length, 1);
eq("variable with payment held and a rate path runs", Renew.run(renewal + 'scenario "Bare" from "Renewal"\n  rate 5.2% variable then 5.4% after 6 months payment held\nshow payment of "Bare"\n').blocks.length, 1);
ok("playground marks variable warnings", read("playground/app.js").includes('class="note warn"'));

// Rate differences are percentage points.
eq("rate minus rate", Renew.run(renewal + 'show rate of "Renewal" - rate of "One year"').blocks[0].text, 'rate of "Renewal" - rate of "One year" = 0.7 percentage points');
eq("one point is singular", Renew.run('let a = 5%\nlet b = 4%\nshow a - b').blocks[0].text, "a - b = 1 percentage point");
eq("negative points", Renew.run('let a = 4%\nlet b = 5.25%\nshow a - b').blocks[0].text, "a - b = -1.25 percentage points");
eq("a rate on its own is still a percentage", Renew.run('let a = 4%\nshow a').blocks[0].text, "a = 4%");

// paid, not total.
eq("paid is a measure", Renew.run(renewal + 'show paid of "Renewal"').blocks[0].text, 'paid of "Renewal" = $191,303.40');
throwsAt("total is refused with a hint", renewal + 'show total of "Renewal"', 9, 6, "Write paid instead of total");
throwsAt("total refused in a measure list", renewal + "compare all by total", 9, 16, "Write paid instead of total");
eq("paid over a horizon heading", Renew.run(renewal + "compare all by paid over 5 years").blocks[0].columns[1], "Paid over 5 years");

// A bare remaining used to be a word for reading only. It now has a meaning (remaining from "Plan"),
// so the bare form is refused with a hint instead of being silently ignored.
ok("bare remaining is refused with a hint", (() => { try { Renew.run(renewal.replace("amortization 20 years", "amortization 20 years remaining")); return false; } catch (e) { return e.message.includes("remaining needs a plan") && e.message.includes("remaining from") && (e.hint || "").includes("leave the word out"); } })());

// A scenario cannot start from a scenario, and the error says why.
throwsAt("scenario from a scenario", renewal + 'scenario "X" from "One year"\n  rate 4%', 9, 19, 'is a scenario. A scenario starts from a mortgage');

// Self walkthrough fix: a rate minus a plain number from a let line points back at that line.
throwsAt("plain number discount points at its let line", 'let discount = 1.5\nmortgage "A"\n  balance $100,000\n  rate posted 5 year on 2026-11-18 - discount\n  amortization 25 years\n  term 5 years', 4, 36, "discount is a plain number (line 1). If it is a rate, write it with a percent sign there, like discount = 1.5%.");
throwsAt("rate plus a bare number gets the percent hint", 'let a = 5%\nshow a + 2', 2, 8, "Add a percent sign, like 2%.");

// The rebuilt 2026 example.
const ex = Renew.run(read("examples/01-renewal-2026.renew"));
const cmp = ex.blocks.find((b) => b.title === "Compare over 5 years");
ok("2021 plan is not in the forward table", !cmp.rows.some((r) => r[0] === "Signed in 2021"));
eq("forward table rows", cmp.rows.map((r) => r[0]).join("|"), "Renewal|Offered 5 year|Offered 1 year, then decide|Keep the old payment");
eq("2021 payment shown on its own", ex.blocks[0].text, 'payment of "Signed in 2021" = $2,848.54');
eq("offered 1 year uses the same discount (independent)", cmp.rows[2][1], "$2,662.83 monthly");
eq("keep the old payment pays no more than before (independent)", cmp.rows[3][1], "$2,846.71 monthly");
eq("keep the old payment amortization", cmp.rows[3][5], "19 years 9 months");
const exs = ex.blocks.find((b) => (b.title || "").startsWith("Sweep renews"));
eq("example sweep against the 5 year offer", exs.rows[exs.rows.length - 1][0], "Offered 5 year (for comparison)");
eq("example sweep 4.5% interest (independent)", exs.rows[2][3], "$87,921.40");
eq("example sweep 5% interest (independent)", exs.rows[3][3], "$95,967.52");
eq("example sweep 4.5% payment after term (independent)", exs.rows[2][2], "$2,775.40 monthly");
ok("example check passes", ex.blocks.find((b) => b.kind === "check").pass);
ok("example compare flags the posted row", cmp.notes.some((n) => n.startsWith('Some rates here are posted Bank of Canada benchmarks ("Renewal")')));

// Documentation wording.
const lang = read("docs/LANGUAGE.md");
ok("no ceiling claim", !/ceiling/i.test(lang));
ok("Bank of Canada description quoted exactly", lang.includes('"The interest rate for a 5-year conventional mortgage offered by chartered banks in Canada."'));
ok("six day lookup labelled as Renew policy", lang.includes("Renew policy"));
ok("remaining documented", lang.includes("`remaining`"));
ok("paid in the reference", lang.includes("| `paid` |") && !lang.includes("| `total` |"));
ok("points documented", lang.includes("percentage points"));
ok("against documented", lang.includes("against"));
done("fair comparisons");
