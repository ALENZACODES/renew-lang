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

// A non-monotonic case: by paid against amortization, the amount paid over 5 years rises until the loan
// is just cleared in those 5 years, then falls as the payment shrinks. Against a 3 year plan it crosses twice.
const multiSrc = 'mortgage "A"\n  balance $400,000\n  rate 5%\n  amortization 25 years\n  term 1 year\nmortgage "B"\n  balance $400,000\n  rate 5%\n  amortization 3 years\n  term 3 years\nshow break even amortization for "A" against "B" by paid over 5 years\n';
const multi = Renew.run(multiSrc).blocks[0];
eq("several crossings: no single value", multi.value, null);
eq("several crossings: type stays duration", multi.type, "duration");
ok("several crossings: the text names both", multi.text.includes("the answer changes more than once, at 3 years, 5 years 4 months"));
ok("several crossings: the note lists both neighbours", multi.notes[0].includes("At 2 years 11 months") && multi.notes[0].includes("at 3 years it does not") && multi.notes[0].includes("At 5 years 3 months") && multi.notes[0].includes("at 5 years 4 months it does"));
ok("several crossings: still adds the paid note", multi.notes[1].startsWith("By paid counts only"));

// Round 7: what the scan guarantees. The old scan tried at most 400 evenly spaced values, so two changes
// between two samples could be missed. Rates and lengths of time are now scanned at every grid value.
{
  // A made-up answer that flips at 12.345% and back at 12.348%: three grid steps wide.
  const narrow = (t) => !(t >= 12345 && t < 12348);
  const sc = K.scanCrossings(0, 30000, narrow);
  eq("rates: every grid value is tried", JSON.stringify([sc.exhaustive, sc.evaluated, sc.gap]), "[true,30001,1]");
  eq("rates: both changes of a three step wide gap are found", JSON.stringify(sc.flips.map((f) => [f.lo, f.hi])), "[[12344,12345],[12347,12348]]");
  // The same gap with the old 400 sample scan: every 75 grid steps, so it was invisible.
  const old = []; for (let i = 0; i <= 400; i++) old.push(narrow(Math.round(i * 30000 / 400)));
  ok("rates: the old 400 sample scan would have missed it", old.every((x) => x === old[0]));
  // One grid step wide: still found.
  const one = K.scanCrossings(0, 30000, (t) => t !== 20000);
  eq("rates: a one step wide change is found", one.flips.length, 2);
  // Three changes inside one old sample gap.
  const three = K.scanCrossings(0, 30000, (t) => !((t >= 5000 && t < 5002) || t >= 5004 && t < 5070));
  eq("rates: four changes close together are all found", three.flips.length, 4);
  // Lengths of time: 1 to 600 months, every month.
  const months = K.scanCrossings(1, 600, (t) => !(t === 300));
  eq("months: every month is tried", JSON.stringify([months.exhaustive, months.evaluated, months.flips.length]), "[true,600,2]");
  // Money: sampled. The test states the limit rather than hiding it.
  const money = K.scanCrossings(0, 5000000, (t) => !(t >= 1000010 && t < 1000100));
  eq("money: sampled, every $2.50 over $0 to $50,000", JSON.stringify([money.exhaustive, money.gap]), "[false,250]");
  eq("money: a change narrower than the spacing can be missed (the documented limit)", money.flips.length, 0);
  const wide = K.scanCrossings(0, 5000000, (t) => !(t >= 1000000 && t < 1000600));
  eq("money: a gap wider than two spacings is found on both sides", wide.flips.length, 2);
}
// The guarantee is said in every break even note.
ok("rate note says every grid value was worked out", r.blocks[3].notes[0].includes("Every value on the grid from 0% to 30% was worked out, so no other change on that grid was missed."));
ok("month note says every grid value was worked out", r.blocks[2].notes[0].includes("Every value on the grid from"));
ok("money note gives the spacing and the limit", r.blocks[0].notes[0].includes("were checked every $2.50 or closer, then narrowed to the cent. Two changes closer together than $2.50 could be missed."));
ok("several crossings note carries the guarantee", multi.notes[0].includes("was worked out, so no other change on that grid was missed"));
// Brute force, without the scan: every renews value from 0% to 30% for the 2026 example. Exactly one
// change, at 4.889%, the same answer the search gives.
{
  const one = plans.One, five = plans.Five, tgt = K.over(five, 60).interest;
  let prev = null; const changes = [];
  for (let t = 0; t <= 30000; t++) {
    const v = K.over(K.plan(Object.assign({}, one.spec, { renews: t / 1000 })), 60).interest < tgt;
    if (prev !== null && v !== prev) changes.push(t / 1000);
    prev = v;
  }
  eq("brute force over all 30,001 renews values finds one change, at 4.889%", JSON.stringify(changes), "[4.889]");
}
// The non-monotonic amortization case, checked month by month without the scan.
{
  const mr = Renew.run(multiSrc), A = mr.plans.find((p) => p.name === "A"), B = mr.plans.find((p) => p.name === "B");
  const tgt = K.over(B, 60).paid; let prev = null; const ch = [];
  for (let m = Math.max(1, A.spec.term); m <= 600; m++) {
    const v = K.over(K.plan(Object.assign({}, A.spec, { amortization: m })), 60).paid < tgt;
    if (prev !== null && v !== prev) ch.push(m);
    prev = v;
  }
  eq("brute force by month agrees with the two crossings", JSON.stringify(ch), "[36,64]");
}
// The search stops each plan at the horizon. That must not change a figure: compare against the whole plan
// for many settings, frequencies and horizons, including held payments and renewal paths.
{
  let bad = 0, n = 0, seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const freqs = Object.keys(K.FREQ), comps = Object.keys(K.COMPOUND);
  for (let t = 0; t < 400; t++) {
    const am = 60 + Math.floor(rnd() * 300), term = 12 * (1 + Math.floor(rnd() * 5));
    const spec = { name: "X", balance: 50000 + Math.floor(rnd() * 900000), rate: Math.round(rnd() * 800) / 100, compounded: comps[t % 3], payments: freqs[t % freqs.length], amortization: am, term: term, extra: rnd() < 0.3 ? 100 : 0, lump: rnd() < 0.2 ? 5000 : 0, renews: rnd() < 0.6 ? Math.round(rnd() * 900) / 100 : undefined, ratePath: [], renewPath: [], paymentHeld: false, rateKind: "fixed", rateBasis: "typed" };
    if (rnd() < 0.3) { spec.rateKind = "variable"; spec.paymentHeld = true; spec.ratePath = [{ after: 12, rate: spec.rate + 0.25 }]; }
    let full; try { full = K.plan(spec); } catch (e) { continue; }
    for (const h of [1, 12, 60, 61, 120, 600]) {
      n++;
      const cut = K.plan(spec, Math.round((h / 12) * K.FREQ[spec.payments].per));
      if (JSON.stringify(K.over(cut, h)) !== JSON.stringify(K.over(full, h))) bad++;
    }
  }
  eq("stopping at the horizon changes no figure (" + n + " plans and horizons)", bad, 0);
  ok("enough cases were compared", n > 1500);
}
done("break even");
