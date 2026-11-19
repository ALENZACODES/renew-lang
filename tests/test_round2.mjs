// Round 2: equal horizons, renews at, sweep, the variable label, payoff assumptions and the notes
// that warn when terms differ. Figures marked "independent" were reproduced with a separate Python
// script using decimal cent rounding, not with this kernel.
import { Renew, eq, ok, throwsAt, done, require } from "./helpers.mjs";
import vm from "vm";

const renewal = 'mortgage "Renewal"\n  balance $441,063.33\n  rate 6.19%\n  amortization 20 years\n  term 5 years\n' +
  'scenario "One year"\n  rate 5.49%\n  term 1 year\n';

// Different terms without a horizon: the table carries a warning.
const a = Renew.run(renewal + "compare all by payment, interest, balance");
ok("different terms warn", a.blocks[0].notes.some((n) => n.startsWith("These plans have different terms (5 years, 1 year)")));
ok("warning suggests over", a.blocks[0].notes[0].includes("Add over 5 years"));
ok("warning is printed in the text report", a.text.includes("Note: These plans have different terms"));
const same = Renew.run('mortgage "A"\n  balance $100,000\n  rate 5%\n  amortization 25 years\n  term 5 years\nscenario "B"\n  rate 4%\ncompare all by payment, interest');
eq("same terms have no warning", same.blocks[0].notes.length, 0);
eq("payment only has no warning", Renew.run(renewal + "compare all by payment").blocks[0].notes.length, 0);

// Equal horizon: every plan covers 60 payments.
const h = Renew.run(renewal + "compare all by payment, interest, balance over 5 years");
eq("horizon title", h.blocks[0].title, "Compare over 5 years");
eq("horizon headers", h.blocks[0].columns.join("|"), "Plan|Payment|Interest over 5 years|Balance after 5 years");
eq("5 year plan over its own term is unchanged", h.blocks[0].rows[0][2], "$125,388.61");
eq("1 year plan over 5 years at an unchanged rate (independent)", h.blocks[0].rows[1][2], "$110,771.65");
eq("1 year plan balance after 5 years (independent)", h.blocks[0].rows[1][3], "$370,864.78");
ok("horizon states the renewal assumption", h.blocks[0].notes[0].includes('"One year" has a 1 year term, so the rest of the 5 years assumes it renews at 5.49%, its current rate.'));
const short = Renew.run(renewal + "compare all by interest over 1 year");
ok("horizon inside a term is said", short.blocks[0].notes.some((n) => n.includes("horizon ends inside it")));
eq("horizon of 1 year on the 5 year plan uses 12 payments", short.blocks[0].rows[0][1], Renew.kernel.money(Renew.run(renewal.replace("term 5 years", "term 1 year") + 'show interest of "Renewal"').plans[0].interest));

// renews at: the payment is worked out again on the balance left over the rest of the amortization.
const r = Renew.run(renewal + '  renews at 6.5%\ncompare all by interest, balance over 5 years\nexplain "One year"');
eq("renews at interest over 5 years (independent)", r.blocks[0].rows[1][1], "$127,234.14");
eq("renews at balance after 5 years (independent)", r.blocks[0].rows[1][2], "$375,817.35");
ok("explain gives the new payment (independent)", r.blocks[1].lines.some((l) => l.includes("renews at 6.5% over the remaining 19 years, so the payment becomes $3,255.96")));
ok("explain states the payoff assumption", r.blocks[1].lines.some((l) => l.includes("assuming the rate is 6.5% after this term")));
eq("renews at does not change the first payment", r.plans[1].payment, 3016.17);
eq("renews at does not change the term", r.plans[1].interest, 23632.54);
const flat = Renew.run(renewal + '  renews at 5.49%\ncompare all by interest over 5 years');
eq("renewing at the same rate matches no renews at", flat.blocks[0].rows[1][1], "$110,771.65");

// Payoff assumption appears wherever payoff is shown.
ok("payoff note in compare", Renew.run(renewal + "compare all by payoff").blocks[0].notes.some((n) => n.startsWith("Time to pay off assumes")));
ok("payoff line in explain", Renew.run(renewal + 'explain "Renewal"').blocks[0].lines.some((l) => l === "Time to pay off: 20 years, assuming the rate stays at 6.19% after this term. That is an assumption, not a forecast."));

// variable is a label, and explain says so.
const v = Renew.run(renewal.replace("rate 5.49%", "rate 5.49% variable") + 'explain "One year"');
ok("variable is explained", v.blocks[0].lines.some((l) => l.startsWith("The rate is marked variable. That is a label")));
eq("variable does not change the payment", v.plans[1].payment, 3016.17);

// sweep
const s = Renew.run(renewal + 'sweep "Renewal" rate from 4% to 6% step 0.5% by payment, interest');
eq("sweep rows", s.blocks[0].rows.length, 5);
eq("sweep first column", s.blocks[0].columns[0], "Rate");
eq("sweep title", s.blocks[0].title, 'Sweep rate for "Renewal"');
eq("sweep row values", s.blocks[0].rows.map((x) => x[0]).join(","), "4%,4.5%,5%,5.5%,6%");
eq("sweep at 6.19% equals the plan", Renew.run(renewal + 'sweep "Renewal" rate from 6.19% to 6.19% step 1% by payment').blocks[0].rows[0][1], "$3,188.39 monthly");
const sr = Renew.run(renewal + 'sweep "One year" renews from 4.5% to 6.5% step 1% by interest over 5 years');
eq("renews sweep end row matches renews at 6.5%", sr.blocks[0].rows[2][1], "$127,234.14");
eq("renews sweep has one plain note", sr.blocks[0].notes[0], "Every row has a 1 year term, so the rest of the 5 years uses the renews at rate in the first column.");
eq("amortization sweep", Renew.run(renewal + 'sweep "Renewal" amortization from 20 years to 30 years step 5 years by payment').blocks[0].rows.map((x) => x[0]).join(","), "20 years,25 years,30 years");
eq("money sweep", Renew.run(renewal + 'sweep "Renewal" extra from $0 to $200 step $100 by payoff').blocks[0].rows.length, 3);
eq("float steps do not drift", Renew.run(renewal + 'sweep "Renewal" rate from 0.1% to 0.3% step 0.1% by rate').blocks[0].rows.map((x) => x[0]).join(","), "0.1%,0.2%,0.3%");

// Type errors and bad ranges.
throwsAt("sweep needs matching units", renewal + 'sweep "Renewal" rate from 4 to 7% step 0.5%', 9, 27, "needs a percentage after from, not a plain number");
throwsAt("sweep step unit", renewal + 'sweep "Renewal" amortization from 20 years to 30 years step 5', 9, 61, "For example: from 20 years to 30 years step 5 years");
throwsAt("sweep unknown setting", renewal + 'sweep "Renewal" rat from 4% to 7% step 0.5%', 9, 17, 'Did you mean "rate"?');
throwsAt("sweep unknown plan", renewal + 'sweep "Renewl" rate from 4% to 7% step 0.5%', 9, 7, 'Did you mean "Renewal"?');
throwsAt("over needs a length of time", renewal + "compare all over 5%", 9, 18, "over needs a length of time");
throwsAt("renews at needs a percentage", renewal + "  renews at $5", 9, 13, "renews must be a percentage");
throwsAt("renews needs at", renewal + "  renews 5%", 9, 10, "Write renews at 5.25%");
function runtimeError(name, src, fragment) {
  try { Renew.run(src); ok(name + ": no error", false); } catch (e) { ok(name + " (" + e.message + ")", e.message.includes(fragment)); }
  try { const sb = { module: { exports: {} }, Math, Object, JSON, Number, String, Array, Error }; vm.runInNewContext(Renew.compile(src), sb); ok(name + " compiled: no error", false); }
  catch (e) { ok(name + " compiled (" + e.message + ")", e.message.includes(fragment)); }
}
runtimeError("sweep step zero", renewal + 'sweep "Renewal" rate from 4% to 7% step 0%', "step in a sweep must be more than zero");
runtimeError("sweep backwards", renewal + 'sweep "Renewal" rate from 7% to 4% step 1%', "from the smaller value");
runtimeError("sweep too long", renewal + 'sweep "Renewal" rate from 1% to 9% step 0.1%', "Keep it to 60 or fewer");
runtimeError("sweep bad value", renewal + 'sweep "Renewal" term from 1 year to 30 years step 10 years', "no longer than the amortization");
runtimeError("horizon too long", renewal + "compare all over 51 years", "between 1 month and 50 years");

// The bundled 2026 example now shows the offered rate beside the posted benchmark, on one horizon.
const ex = Renew.run(require("fs").readFileSync(new URL("../examples/01-renewal-2026.renew", import.meta.url), "utf8"));
// (Round 3 moved the 2021 plan out of this table and shows rate differences in percentage points.)
eq("example compares over 5 years", ex.blocks[2].title, "Compare over 5 years");
eq("example offered rate row", ex.blocks[2].rows[1][0], "Offered 5 year");
eq("example posted minus offered", ex.blocks[3].text, 'rate of "Renewal" - rate of "Offered 5 year" = 1.5 percentage points');
done("round 2");
