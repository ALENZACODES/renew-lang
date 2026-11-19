// break even on any setting a sweep can change: rate, balance, amortization, term, extra, lump and renews.
// For each answer the test works out the plan one grid step either side, without the search, and checks
// that the answer really changes there. It also checks the wording: a grid value, not an exact crossing,
// and a note that by paid ignores the balance still owed.
import { Renew, eq, ok, throwsAt, done } from "./helpers.mjs";
const K = Renew.kernel;
const src = 'mortgage "Five"\n  balance $441,063.33\n  rate 4.69%\n  amortization 20 years\n  term 5 years\n' +
  'scenario "One"\n  rate 3.99%\n  term 1 year\n  renews at 5.5%\n';
const SET = { extra: "$1,204.51", lump: "$17,919.52", amortization: "12 years 2 months", rate: "1.869%", term: "2 years 7 months", renews: "4.889%" };
const GRID = { percent: 0.001, money: 0.01, duration: 1 };
const lines = Object.keys(SET).map((p) => "show break even " + p + ' for "One" against "Five" by interest over 5 years');
lines.push('show break even balance for "One" against "Five" by paid over 5 years');
const r = Renew.run(src + lines.join("\n") + "\n");
const plans = Object.fromEntries(r.plans.map((p) => [p.name, p]));
const target = (m) => K.over(plans.Five, 60)[m];
const at = (prop, v, m) => K.over(K.plan(Object.assign({}, plans.One.spec, { [prop]: v })), 60)[m];
[...Object.keys(SET), "balance"].forEach((prop, k) => {
  const b = r.blocks[k], m = prop === "balance" ? "paid" : "interest";
  if (SET[prop]) eq("break even " + prop + " value", b.text.split(" = ")[1], SET[prop]);
  const step = GRID[b.type], below = Math.round((b.value - step) * 1000) / 1000;
  ok("break even " + prop + ": the answer changes between " + below + " and " + b.value, (at(prop, below, m) < target(m)) !== (at(prop, b.value, m) < target(m)));
  ok("break even " + prop + ": grid wording", b.notes[0].includes("is the first value on that grid where the answer changes for this model. It is not an exact continuous crossing"));
});
eq("renews answer is the same as before the change", r.blocks[5].value, 4.889);
ok("money grid named", r.blocks[0].notes[0].includes("a grid of one cent"));
ok("month grid named", r.blocks[2].notes[0].includes("a grid of one month"));
ok("rate grid named", r.blocks[3].notes[0].includes("a grid of a thousandth of a percentage point"));
ok("the note says which side is cheaper when the answer starts costing less", r.blocks[0].notes[0].startsWith('With extra at $1,204.50, "One" has interest over 5 years of $94,169.02, which is not less than "Five" at $94,169.01. With extra at $1,204.51 it has $94,168.92, less than "Five"'));
ok("by paid adds the balance note", r.blocks[6].notes[1] === "By paid counts only the money paid over 5 years. It ignores the balance still owed at the end, so a plan can pay less and still owe more. Use by interest to count both.");
ok("by interest has no balance note", !r.blocks[0].notes.some((n) => n.startsWith("By paid")));
eq("value and type for --json", JSON.stringify([r.blocks[0].value, r.blocks[0].type, r.blocks[2].value, r.blocks[2].type]), '[1204.51,"money",146,"duration"]');
// No crossing in range: said plainly.
const none = Renew.run(src + 'show break even extra for "Five" against "One" by interest over 5 years\n').blocks[0];
ok("no crossing in the range", none.text.endsWith("= no value of extra from $0.00 to $50,000.00 changes the answer") && none.value === null);
ok("no crossing note", none.notes[0].startsWith("With extra anywhere from $0.00 to $50,000.00"));
// Restrictions and errors.
throwsAt("unknown setting", src + 'show break even payments for "One" against "Five" by interest over 5 years\n', 10, 17, "break even changes one setting");
throwsAt("rate with a rate path is refused", src + 'scenario "V" from "Five"\n  rate 5% then 4% after 12 months\nshow break even rate for "V" against "Five" by interest over 5 years\n', 12, 26, "cannot have a rate path");
throwsAt("renews still needs a horizon past the term", src + 'show break even renews for "Five" against "One" by interest over 3 years\n', 10, null, "horizon longer than the term");
throwsAt("break even type is the setting's type", src + 'show break even extra for "One" against "Five" by interest over 5 years + 1%\n', 10, null, null);
// The compiler gives the same answers.
import vm from "vm";
const sb = { module: { exports: {} }, Math, Object, JSON, Number, String, Array, Error }; sb.globalThis = sb;
vm.runInNewContext(Renew.compile(src + lines.join("\n") + "\n"), sb);
eq("compiled break even matches", sb.module.exports.report, r.text);
done("break even");
