// Round 8: the money break even search has a coverage guarantee. An interval of amounts is skipped only when a
// derived bound on how fast the answer can move (K and R, written out in docs/LANGUAGE.md) shows no amount
// inside it can change the answer; everything else is split down to single cents. The guarantee is only as
// good as that bound, so round 9 also checks each half of the bound on its own (sections 5 to 7). These tests check the bound itself on random plans, compare the search
// with a brute force walk over every cent, and build an adversarial case with two changes 29 cents apart that
// the old sampled scan ($500 spacing) could not see.
import { Renew, eq, ok, done, root } from "./helpers.mjs";
import { readFileSync } from "fs";
import { join } from "path";
const K = Renew.kernel;
const over = (spec, prop, cents, measure, horizon, N) => K.over(K.plan(Object.assign({}, spec, { [prop]: cents / 100 }), N), horizon)[measure];

// 1. The bound holds: for random plans (every payment frequency, every compounding, renewals, renewal paths,
// rate paths, payment held, lumps and extras), the change in the answer between two amounts is never more
// than K times the change in dollars plus twice the rounding allowance R. A fixed seed keeps this repeatable.
let seed = 20261119;
const rnd = (a, b) => { seed = (seed * 1103515245 + 12345) % 2147483648; return a + (seed / 2147483648) * (b - a); };
const freqs = Object.keys(K.FREQ), comps = Object.keys(K.COMPOUND);
let pairs = 0, broken = 0, worst = 0;
for (let trial = 0; trial < 600; trial++) {
  const spec = { name: "A", balance: Math.round(rnd(1000, 2e6) * 100) / 100, rate: Math.round(rnd(0, 20) * 1000) / 1000, amortization: Math.round(rnd(12, 600)), payments: freqs[trial % freqs.length], compounded: comps[trial % 3] };
  spec.term = Math.min(spec.amortization, Math.max(1, Math.round(rnd(1, 120))));
  if (trial % 2) spec.renews = Math.round(rnd(0, 20) * 1000) / 1000;
  if (trial % 5 === 1) spec.renewPath = [{ after: Math.round(rnd(1, 60)), rate: Math.round(rnd(0, 20) * 1000) / 1000 }];
  if (trial % 4 === 2) { spec.ratePath = [{ after: Math.max(1, Math.round(rnd(1, spec.term))), rate: Math.round(rnd(0, 20) * 1000) / 1000 }]; if (trial % 8 === 2) spec.paymentHeld = true; }
  if (trial % 3 === 0) spec.lump = Math.round(rnd(0, 50000));
  if (trial % 7 === 0) spec.extra = Math.round(rnd(0, 500));
  const prop = ["balance", "lump", "extra"][trial % 3], measure = trial % 2 ? "paid" : "interest", horizon = [12, 60, 120, 300, 600][trial % 5];
  const b = K.moneyBound(spec, prop, measure, horizon);
  for (let j = 0; j < 12; j++) {
    const x = Math.round(rnd(prop === "balance" ? 100 : 0, prop === "extra" ? 500000 : spec.balance * 150)), d = Math.max(1, Math.round(rnd(1, j % 3 ? 5000 : 500000)));
    let fa, fb;
    try { fa = over(spec, prop, x, measure, horizon, b.N); fb = over(spec, prop, x + d, measure, horizon, b.N); } catch (e) { continue; }
    pairs++;
    const lim = b.K * d / 100 + 2 * b.R, diff = Math.abs(fa - fb);
    if (diff > lim) broken++;
    worst = Math.max(worst, diff / lim);
  }
}
ok("bound: many random pairs checked", pairs > 5000);
eq("bound: no pair moves more than the bound allows", broken, 0);
ok("bound: the bound is not loose for nothing (some pair uses more than half of it)", worst > 0.5);

// 2. The certified search against a brute force walk over every cent, on ranges small enough to walk.
const base = { name: "B", balance: 300000, rate: 4.5, amortization: 300, term: 60, payments: "monthly", compounded: "semi-annually" };
const ref = Object.assign({}, base, { name: "R", rate: 3.9, term: 12, renews: 5.2 });
const cases = [
  { prop: "extra", lo: 0, hi: 200000, measure: "interest", spec: Object.assign({}, base, { rate: 5.4 }), refSpec: ref },
  { prop: "extra", lo: 0, hi: 100000, measure: "interest", spec: Object.assign({}, base, { rate: 5.4, payments: "accelerated biweekly" }), refSpec: ref },
  { prop: "extra", lo: 0, hi: 100000, measure: "paid", spec: Object.assign({}, base, { rate: 4.6, payments: "weekly" }), refSpec: ref },
  { prop: "lump", lo: 1100000, hi: 1300000, measure: "interest", spec: Object.assign({}, base, { rate: 5.4 }), refSpec: ref },
  { prop: "balance", lo: 28700000, hi: 28900000, measure: "paid", spec: ref, refSpec: base }
];
for (const c of cases) {
  const horizon = 60, N = Math.round(horizon / 12 * K.FREQ[c.spec.payments].per);
  const target = K.over(K.plan(c.refSpec), horizon)[c.measure];
  const value = (t) => over(c.spec, c.prop, t, c.measure, horizon, N);
  const cert = K.certifiedScan(c.lo, c.hi, value, target, K.moneyBound(c.spec, c.prop, c.measure, horizon));
  const brute = [];
  let prev = value(c.lo) < target;
  for (let t = c.lo + 1; t <= c.hi; t++) { const now = value(t) < target; if (now !== prev) brute.push(t); prev = now; }
  const label = c.prop + " by " + c.measure + " " + c.lo + " to " + c.hi + " cents";
  ok("certified: " + label + " finished", cert !== null);
  eq("certified: " + label + " finds exactly the brute force changes", JSON.stringify(cert.flips.map((f) => f.hi)), JSON.stringify(brute));
  eq("certified: " + label + " has one change to find", brute.length, 1);
  ok("certified: " + label + " used far fewer plans than the brute force walk", cert.evaluated < (c.hi - c.lo) / 10);
}

// 3. Adversarial: two changes 29 cents apart. Everything paid over 5 years rises with the yearly lump until the
// loan is paid off inside the 5 years, then falls, so a plan whose total sits just under the peak is crossed
// twice, close together. "Ref" pays $114,884.40, 40 cents a payment under the peak of about $114,884.48.
const src = 'mortgage "Base"\n  balance $100,000\n  rate 5%\n  amortization 25 years\n  term 5 years\n  lump $0 every year\n\n' +
  'mortgage "Ref"\n  balance $329,215.72\n  rate 5%\n  amortization 25 years\n  term 5 years\n\n' +
  'show paid of "Ref"\nshow break even lump for "Base" against "Ref" by paid over 5 years\n';
const r = Renew.run(src);
eq("adversarial: the reference total", r.blocks[0].text, 'paid of "Ref" = $114,884.40');
eq("adversarial: both changes found", r.blocks[1].text, 'break even lump for "Base" against "Ref" by paid over 5 years = the answer changes more than once, at $15,997.68, $15,997.97');
ok("adversarial: the note says every cent is covered", r.blocks[1].notes[0].includes("Every cent from $0.00 to $10,000,000.00 is covered"));
{
  const spec = r.plans.find((p) => p.name === "Base").spec, tgt = K.over(r.plans.find((p) => p.name === "Ref"), 60).paid;
  const less = (t) => K.over(K.plan(Object.assign({}, spec, { lump: t / 100 }), 60), 60).paid < tgt;
  const changes = [];
  let prev = less(1590000);
  for (let t = 1590001; t <= 1610000; t++) { const now = less(t); if (now !== prev) changes.push(t / 100); prev = now; }
  eq("adversarial: brute force over $15,900 to $16,100 agrees", JSON.stringify(changes), "[15997.68,15997.97]");
  const old = K.scanCrossings(0, 1000000000, less);
  eq("adversarial: the old sampled scan, $500 apart, saw nothing", JSON.stringify([old.flips.length, old.gap]), "[0,50000]");
}

// 4. The fallback is honest. With a budget too small to finish, the certified scan gives up (returns null),
// and the kernel then uses the sampled scan and says so in the note.
{
  const tight = K.certifiedScan(0, 1000000000, (t) => t / 100, 5e6, { K: 1e9, R: 0 });
  eq("fallback: an impossible bound runs out of budget", tight, null);
  ok("fallback: the note for a sampled search names the spacing", K.breakEvenNote({ prop: "lump", type: "money", from: 0, to: 1e7, reason: "never", value: null, target: 1, exhaustive: false, fallback: true, spacing: 500 }, "A", "B", "paid", 60).includes("The certified money search could not finish here, so this is the sampled search. Money values from $0.00 to $10,000,000.00 were checked every $500.00 or closer"));
}

// 5. Round 9: the two halves of the bound, each checked on its own. The bound in docs/LANGUAGE.md says
// (a) the exact answer, the same plan worked out with no rounding to the cent, moves by at most K x d when the
// setting moves by d dollars, and (b) the answer Renew reports, rounded to the cent at every payment, is within
// R of the exact answer at the same amount. An exact kernel is made from the real one by replacing cents()
// with no rounding at all, so the two differ only in rounding.
const ksrc = readFileSync(join(root, "src/kernel.js"), "utf8");
const centsDef = "function cents(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }";
ok("exact model: the kernel rounds in one place", ksrc.split(centsDef).length === 2);
const E = new Function(ksrc.replace(centsDef, "function cents(x) { return x; }").replace(/if \(typeof module[^\n]*\n?/, "") + "\nreturn renewKernel();")();
{
  seed = 20261120;
  let n = 0, badR = 0, badK = 0, worstR = 0, worstK = 0;
  for (let trial = 0; trial < 600; trial++) {
    const spec = { name: "A", balance: Math.round(rnd(1000, 2e6) * 100) / 100, rate: Math.round(rnd(0, 20) * 1000) / 1000, amortization: Math.round(rnd(12, 600)), payments: freqs[trial % freqs.length], compounded: comps[trial % 3] };
    spec.term = Math.min(spec.amortization, Math.max(1, Math.round(rnd(1, 120))));
    if (trial % 2) spec.renews = Math.round(rnd(0, 20) * 1000) / 1000;
    if (trial % 5 === 1) spec.renewPath = [{ after: Math.round(rnd(1, 60)), rate: Math.round(rnd(0, 20) * 1000) / 1000 }];
    if (trial % 4 === 2) { spec.ratePath = [{ after: Math.max(1, Math.round(rnd(1, spec.term))), rate: Math.round(rnd(0, 20) * 1000) / 1000 }]; if (trial % 8 === 2) spec.paymentHeld = true; }
    if (trial % 3 === 0) spec.lump = Math.round(rnd(0, 50000));
    if (trial % 7 === 0) spec.extra = Math.round(rnd(0, 500));
    const prop = ["balance", "lump", "extra"][trial % 3], measure = trial % 2 ? "paid" : "interest", horizon = [12, 60, 120, 300, 600][trial % 5];
    const b = K.moneyBound(spec, prop, measure, horizon);
    const f = (Kr, c) => Kr.over(Kr.plan(Object.assign({}, spec, { [prop]: c / 100 }), b.N), horizon)[measure];
    for (let j = 0; j < 10; j++) {
      const x = Math.round(rnd(prop === "balance" ? 100 : 0, prop === "extra" ? 500000 : spec.balance * 150)), d = Math.max(1, Math.round(rnd(1, j % 3 ? 5000 : 500000)));
      let r1, e1, e2;
      try { r1 = f(K, x); e1 = f(E, x); e2 = f(E, x + d); } catch (err) { continue; }
      n++;
      const dr = Math.abs(r1 - e1); if (dr > b.R) badR++; worstR = Math.max(worstR, dr / b.R);
      const dk = Math.abs(e2 - e1), lk = b.K * d / 100; if (dk > lk + 1e-6) badK++; worstK = Math.max(worstK, dk / lk);
    }
  }
  ok("exact model: many random amounts checked", n > 5000);
  eq("exact model: the rounded answer is never more than R from the exact one", badR, 0);
  eq("exact model: the exact answer never moves more than K x d", badK, 0);
  ok("exact model: K is not loose for nothing (some pair uses more than half of it)", worstK > 0.5);
}

// 6. Round 9: one cent of balance can move the payment by a cent. Over N payments that moves everything paid
// by about N cents, all from rounding. R must cover it: 2R is at least N cents, and the jump stays inside the
// band K x 0.01 + 2R that the search uses for two neighbouring cents.
{
  const spec = { name: "A", balance: 400000, rate: 5, amortization: 300, term: 60, payments: "monthly", compounded: "semi-annually" };
  const horizon = 60, b = K.moneyBound(spec, "balance", "paid", horizon);
  const pay = (c) => K.plan(Object.assign({}, spec, { balance: c / 100 }), b.N).payment;
  const paid = (c) => K.over(K.plan(Object.assign({}, spec, { balance: c / 100 }), b.N), horizon).paid;
  let at = null;
  for (let c = 40000000; c < 40020000 && at === null; c++) if (pay(c + 1) !== pay(c)) at = c;
  ok("rounding: a one cent balance change that moves the payment by a cent exists", at !== null);
  const jump = Math.abs(paid(at + 1) - paid(at));
  ok("rounding: everything paid jumps by about N cents there (" + jump.toFixed(2) + ")", jump >= 0.01 * b.N - 0.02);
  ok("rounding: 2R covers N cents", 2 * b.R >= 0.01 * b.N);
  ok("rounding: the jump is inside the band for neighbouring cents", jump <= b.K / 100 + 2 * b.R);
  eq("rounding: R is the formula in docs/LANGUAGE.md", b.R, (0.005 * b.N + 0.015 * b.N * b.G * (1 + b.i * b.N)) * 1.25 + 1e-6);
}

// 7. Round 9: when the fallback applies. A plan paid off inside the horizon is not a fallback case (its balance
// and interest are simply zero for the rest of the horizon, and the bound still holds), so the lump search in
// section 3, whose largest lumps clear the loan in the first year, stays certified. The fallback runs only when
// the evaluation budget runs out or a plan is neither paid off nor able to make all N payments.
{
  const spec = r.plans.find((p) => p.name === "Base").spec;
  const big = K.plan(Object.assign({}, spec, { lump: 10000000 }), 60);
  ok("fallback: the largest lump pays the loan off inside the horizon", Number.isFinite(big.payoff) && big.payoff <= 60);
  const be = K.breakEvenSetting(spec, r.plans.find((p) => p.name === "Ref"), "lump", "paid", 60);
  ok("fallback: a plan paid off inside the horizon stays certified", be.certified === true && !be.fallback);
  ok("fallback: the docs state both fallback conditions", readFileSync(join(root, "docs/LANGUAGE.md"), "utf8").includes("The certified search falls back to the sampled search in exactly two cases"));
}
// 8. Round 10: fallback case 2, triggered for real. Before round 10, the payment rounded to the cent could fail
// to beat the interest rounded to the cent on a balance of a few dollars (at 2% over 25 years, $1.00 gave a
// $0.00 payment), so the plan was never repaid and every balance break even on such a plan fell back to the
// sampled search. A copy of the kernel with that payment rule (payFloor removed) shows the fallback firing, with
// its reason in the note; the real kernel now keeps every payment at least a cent above its interest, so the
// same search stays certified.
const floorDef = "function payFloor(pay, bal, i) { return Math.max(pay, cents(cents(bal * i) + 0.01)); }";
ok("payment floor: defined in one place", ksrc.split(floorDef).length === 2);
const OLD = new Function(ksrc.replace(floorDef, "function payFloor(pay, bal, i) { return pay; }").replace(/if \(typeof module[^\n]*\n?/, "") + "\nreturn renewKernel();")();
{
  const low = { name: "Low", balance: 300000, rate: 2, amortization: 300, term: 60, payments: "monthly", compounded: "semi-annually" };
  const lowRef = Object.assign({}, low, { name: "LowRef", balance: 250000, rate: 2.5 });
  const old = OLD.breakEvenSetting(low, OLD.plan(lowRef), "balance", "interest", 60);
  ok("fallback case 2: the old payment rule falls back", old.fallback === true && old.certified === false);
  eq("fallback case 2: the reason is a payment that stopped covering its interest", old.fallbackReason, "stopped");
  eq("fallback case 2: at the first amount tried, $1.00", old.stoppedAt, 1);
  const oldNote = OLD.breakEvenNote(old, "Low", "LowRef", "interest", 60);
  ok("fallback case 2: the note gives the reason and the spacing", oldNote.includes("The certified money search could not finish here (at balance $1.00 a payment stopped covering its interest, and the bound does not hold there), so this is the sampled search.") && oldNote.includes("could be missed"));
  const now = K.breakEvenSetting(low, K.plan(lowRef), "balance", "interest", 60);
  ok("fallback case 2: the real kernel stays certified on the same search", now.certified === true && !now.fallback);
  eq("fallback case 2: both find the same crossing here", now.value, old.value);
  const tiny = K.plan(Object.assign({}, low, { balance: 1 }));
  ok("payment floor: $1.00 at 2% over 25 years now pays $0.01 and is repaid", tiny.payment === 0.01 && Number.isFinite(tiny.payoff));
  // Every cent from $1.00 to $1,000.00 on four plans, the old rule against the real one.
  for (const [rate, am, pay] of [[2, 300, "monthly"], [8, 300, "monthly"], [20, 600, "monthly"], [30, 600, "weekly"]]) {
    let oldStops = 0, newStops = 0;
    for (let c = 100; c <= 100000; c++) {
      const s = { name: "T", balance: c / 100, rate, amortization: am, term: 60, payments: pay, compounded: "semi-annually" };
      const N = Math.round(5 * K.FREQ[pay].per);
      const a = OLD.plan(s, N), b = K.plan(s, N);
      if (!Number.isFinite(a.payoff) && a.all.length < N) oldStops++;
      if (!Number.isFinite(b.payoff) && b.all.length < N) newStops++;
    }
    ok("payment floor: " + rate + "% over " + am / 12 + " years " + pay + ", the old rule stops on some balance up to $1,000 (" + oldStops + ")", oldStops > 0);
    eq("payment floor: " + rate + "% over " + am / 12 + " years " + pay + ", no balance from $1.00 to $1,000.00 stops now", newStops, 0);
  }
  // On ordinary plans the floor never binds: the payment is the formula's, rounded, exactly as before.
  seed = 20261121;
  let differ = 0;
  for (let trial = 0; trial < 2000; trial++) {
    const s = { name: "O", balance: Math.round(rnd(10000, 2e6)), rate: Math.round(rnd(0, 15) * 100) / 100, amortization: Math.round(rnd(60, 420)), term: 12, payments: freqs[trial % freqs.length], compounded: comps[trial % 3] };
    if (K.plan(s).payment !== OLD.plan(s).payment) differ++;
  }
  eq("payment floor: 2,000 ordinary plans ($10,000 up, 0% to 15%, up to 35 years) have the same payment as before", differ, 0);
  // The budget fallback names its own reason.
  ok("fallback case 1: the note names the budget", K.breakEvenNote({ prop: "lump", type: "money", from: 0, to: 1e7, reason: "never", value: null, target: 1, exhaustive: false, fallback: true, fallbackReason: "budget", spacing: 500 }, "A", "B", "paid", 60).includes("could not finish here (it worked out 150,000 amounts without finishing), so this is the sampled search."));
}

// 9. Round 10: amortization to fit with a balance search. The amortization is worked out once, from the plan as
// written, and held while the balance changes, so the payment moves smoothly with the balance and claim (a)
// applies. Fitting again per amount would move the amortization by whole months and make the payment jump.
{
  const fitSrc = 'mortgage "Base"\n  balance $400,000\n  rate 5%\n  amortization to fit $2,600\n  term 5 years\n\nmortgage "Ref"\n  balance $380,000\n  rate 5.5%\n  amortization 25 years\n  term 5 years\n' +
    'sweep "Base" balance from $350,000 to $400,000 step $25,000 by payment\nshow break even balance "Base" vs "Ref" by interest over 5 years\n';
  const fr = Renew.run(fitSrc);
  const fitted = fr.plans.find((p) => p.name === "Base").spec;
  eq("fit: the amortization is fitted once, 20 years 5 months", fitted.amortization, 245);
  const be = fr.blocks[1];
  ok("fit: the balance search stays certified", be.notes[0].includes("Every cent from $1.00 to $10,000,000.00 is covered, if the bound in docs/LANGUAGE.md holds"));
  ok("fit: the note says the amortization is held", be.notes[0].includes('The amortization of "Base", 20 years 5 months, came from amortization to fit, worked out once from the plan as written. The search keeps 20 years 5 months for every balance it tries; it is not worked out again for each one.'));
  ok("fit: the sweep says the same", fr.blocks[0].notes.some((n) => n.includes("Every row keeps 20 years 5 months; it is not worked out again for each balance.")));
  const written = Renew.run(fitSrc.replace("amortization to fit $2,600", "amortization 20 years 5 months"));
  eq("fit: the same answer as the plan with 20 years 5 months written out", be.value, written.blocks[1].value);
  ok("fit: the written out plan has no fit note", !written.blocks[1].notes[0].includes("amortization to fit"));
  const tgt = K.over(fr.plans.find((p) => p.name === "Ref"), 60).interest;
  const v = (c) => K.over(K.plan(Object.assign({}, fitted, { balance: c / 100 }), 60), 60).interest;
  const at = Math.round(be.value * 100), flips = [];
  let prev = v(at - 3000) < tgt;
  for (let c = at - 2999; c <= at + 3000; c++) { const now = v(c) < tgt; if (now !== prev) flips.push(c); prev = now; }
  eq("fit: brute force over $30 either side finds the same single change", JSON.stringify(flips), JSON.stringify([at]));
  const b = K.moneyBound(fitted, "balance", "interest", 60);
  let worstFit = 0;
  for (let j = 0; j < 400; j++) { const x = Math.round(rnd(100, 1e9)), d = Math.max(1, Math.round(rnd(1, 2000000))); const e1 = E.over(E.plan(Object.assign({}, fitted, { balance: x / 100 }), b.N), 60).interest, e2 = E.over(E.plan(Object.assign({}, fitted, { balance: (x + d) / 100 }), b.N), 60).interest; worstFit = Math.max(worstFit, Math.abs(e2 - e1) / (b.K * d / 100)); }
  ok("fit: claim (a) holds on the fitted plan for 400 random pairs (worst " + worstFit.toFixed(3) + " of K)", worstFit <= 1);
  const sc = Renew.run(fitSrc.replace('sweep "Base"', 'scenario "Own" from "Base"\n  amortization 25 years\nsweep "Own" balance from $350,000 to $400,000 step $25,000 by payment\nsweep "Base"'));
  ok("fit: a scenario that sets its own amortization has no fit note", !sc.blocks[0].notes.some((n) => n.includes("amortization to fit")));
  // Round 11: the one setting rule, for a rate sweep, where the bound plays no part. Each row is the plan as
  // written with only the rate changed, so it equals a compare of that plan with 20 years 5 months written out.
  const rs = Renew.run('mortgage "Base"\n  balance $400,000\n  rate 5%\n  amortization to fit $2,600\n  term 5 years\n\nsweep "Base" rate from 4% to 6% step 1% by payment, interest over 5 years\n');
  ok("fit: a rate sweep says it keeps the fitted amortization", rs.blocks[0].notes.some((n) => n.includes("Every row keeps 20 years 5 months; it is not worked out again for each rate.")));
  for (const [k, rate] of [[0, "4%"], [2, "6%"]]) {
    const one = Renew.run('mortgage "W"\n  balance $400,000\n  rate ' + rate + '\n  amortization 20 years 5 months\n  term 5 years\n\ncompare all by payment, interest over 5 years\n');
    eq("fit: rate sweep row " + rate + " equals the plan with the amortization written out", JSON.stringify(rs.blocks[0].raw[k].slice(1)), JSON.stringify(one.blocks[0].raw[0].slice(1)));
  }
  ok("fit: at 6% the held amortization no longer fits $2,600, and the row shows it", rs.blocks[0].raw[2][1] > 2600);
}

// 10. Round 10: independent boundary tests of the search itself, with no mortgage maths. A made up answer F is
// built to use all of a stated K (it climbs and falls at exactly K per cent between narrow dips) and the
// reported answer adds a rounding error of up to R at every cent, so the bound is tight, not loose. The dips
// reach a hair under, exactly at, or just over the target. certifiedScan must find exactly the changes a walk
// over every cent finds. Exactly at the target is not less, so a dip that only touches it is no change.
{
  let s2 = 20261122;
  const r2 = () => { s2 = (s2 * 1103515245 + 12345) % 2147483648; return s2 / 2147483648; };
  let windows = 0, mismatched = 0, changes = 0;
  for (let w = 0; w < 30; w++) {
    const span = 60000 + Math.floor(r2() * 60000), Kc = 0.01 + r2() * 0.5, Rr = r2() < 0.3 ? 0 : r2() * 0.05, target = 1000;
    const dips = [];
    for (let d = 0; d < 8; d++) {
      const where = Math.floor(r2() * span), kind = d % 4;
      // depth below the target: just under by a hundredth of a cent, exactly at it, just over, or clearly under
      const depth = [1e-4, 0, -1e-4, 2 * Rr + Kc][kind];
      dips.push({ where, depth });
      if (d === 3) dips.push({ where: Math.min(span, where + 1), depth: 1e-4 }); // two dips one cent apart
    }
    const F = (t) => dips.reduce((m, d) => Math.min(m, target - d.depth + Kc * Math.abs(t - d.where)), target + Kc * span);
    const noise = (t) => Rr ? Rr * Math.sin(t * 12.9898 + w) * (t % 3 === 0 ? 1 : -1) : 0;
    const f = (t) => F(t) + noise(t);
    const cert = K.certifiedScan(0, span, f, target, { K: Kc * 100, R: Rr });
    const brute = []; let prev = f(0) < target;
    for (let t = 1; t <= span; t++) { const now = f(t) < target; if (now !== prev) brute.push(t); prev = now; }
    windows++; changes += brute.length;
    if (!cert || JSON.stringify(cert.flips.map((x) => x.hi)) !== JSON.stringify(brute)) mismatched++;
  }
  eq("boundary: 30 made up answers that use all of K and R, the search matches a walk over every cent", mismatched, 0);
  ok("boundary: they hold many changes to find (" + changes + ")", changes > 100);
}

// 11. Round 10: brute force on more windows near real crossings. For 24 random plan pairs with a change in
// range, every cent within $25 of each change the search reports is walked, and no other change may appear there.
{
  seed = 20261123;
  let checked = 0, missed = 0, crossingsSeen = 0;
  for (let trial = 0; trial < 60 && checked < 24; trial++) {
    const spec = { name: "A", balance: Math.round(rnd(100000, 900000)), rate: Math.round(rnd(1, 9) * 100) / 100, amortization: 12 * Math.round(rnd(15, 30)), term: 12 * Math.round(rnd(1, 5)), payments: freqs[trial % freqs.length], compounded: comps[trial % 3] };
    if (trial % 2) spec.renews = Math.round(rnd(1, 9) * 100) / 100;
    if (trial % 3 === 0) spec.lump = Math.round(rnd(0, 20000));
    const ref = Object.assign({}, spec, { name: "B", rate: Math.round((spec.rate + rnd(-1, 1)) * 100) / 100, balance: Math.round(spec.balance * rnd(0.9, 1.1)) });
    if (ref.rate < 0) continue;
    const prop = ["balance", "extra", "lump"][trial % 3], measure = trial % 2 ? "paid" : "interest";
    let r;
    try { r = K.breakEvenSetting(spec, K.plan(ref), prop, measure, 60); } catch (err) { continue; }
    if (!r.certified || !r.crossings.length) continue;
    checked++;
    const N = Math.round(5 * K.FREQ[spec.payments].per), tgt = r.target;
    const less = (c) => K.over(K.plan(Object.assign({}, spec, { [prop]: c / 100 }), N), 60)[measure] < tgt;
    for (const c of r.crossings) {
      crossingsSeen++;
      const at = Math.round(c.value * 100), lo = Math.max(Math.round(r.from * 100), at - 2500), hi = Math.min(Math.round(r.to * 100), at + 2500);
      const found = []; let prev = less(lo);
      for (let t = lo + 1; t <= hi; t++) { const now = less(t); if (now !== prev) found.push(t); prev = now; }
      const reported = r.crossings.map((x) => Math.round(x.value * 100)).filter((x) => x > lo && x <= hi);
      if (JSON.stringify(found) !== JSON.stringify(reported)) missed++;
    }
  }
  ok("windows: 24 random plan pairs with a certified change", checked === 24);
  eq("windows: every cent within $25 of each change agrees with the search (" + crossingsSeen + " changes)", missed, 0);
}

// 12. Round 10: every place that says every cent is covered also says it depends on the bound.
{
  const files = ["README.md", "DEVPOST.md", "docs/DESIGN.md", "docs/LANGUAGE.md", "docs/TESTS.md", "docs/INTEGRATION.md", "docs/WALKTHROUGH.md", "examples/07-two-crossings.renew", "playground/index.html", "playground/app.js", "src/examples.js", "src/kernel.js"];
  let bare = [];
  for (const f of files) {
    const text = readFileSync(join(root, f), "utf8").replace(/\\n# /g, " ").replace(/\n# /g, " ").replace(/\s+/g, " ");
    // Split into sentences at a full stop followed by a space, so amounts like $10,000,000.00 stay whole.
    for (const sentence of text.split(/(?<=\.)\s+/)) if (/every cent/i.test(sentence) && /cover/i.test(sentence) && !/bound/i.test(sentence)) bare.push(f + ": " + sentence.trim());
  }
  eq("wording: no unqualified 'covers every cent' (" + bare.join(" | ") + ")", bare.length, 0);
}
// 13. Round 11: the derivation of claim (a), step by step, each step tested on the exact kernel E (no rounding),
// in the order docs/LANGUAGE.md gives them. Step 1: one more dollar of balance never lowers a later balance, and
// raises it by at most (1 + i) per payment, so by at most (1 + i) ^ k after k payments, through every payment rule
// (the formula, the one cent floor, a payment worked out again at a change or a renewal, a held payment, the last
// payment that clears the loan, extras and lumps). Step 2: the interest at payment k moves by at most i times the
// move in the balance it starts from, and in the same direction. Step 3: everything paid is the interest plus
// the start balance minus the end balance, exactly. Step 4: the K the search uses holds with no safety margin at
// all, on wide and on one cent steps, so the quarter added in moneyBound is margin, not a patch.
{
  seed = 20261124;
  let pairs = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, worst4 = 0, plans = 0;
  for (let trial = 0; trial < 900; trial++) {
    const spec = { name: "A", balance: Math.round(rnd(1000, 2e6) * 100) / 100, rate: Math.round(rnd(0, 20) * 1000) / 1000, amortization: Math.round(rnd(12, 600)), payments: freqs[trial % freqs.length], compounded: comps[trial % 3] };
    spec.term = Math.min(spec.amortization, Math.max(1, Math.round(rnd(1, 120))));
    if (trial % 2) spec.renews = Math.round(rnd(0, 20) * 1000) / 1000;
    if (trial % 5 === 1) spec.renewPath = [{ after: Math.round(rnd(1, 60)), rate: Math.round(rnd(0, 20) * 1000) / 1000 }];
    if (trial % 4 === 2) { spec.ratePath = [{ after: Math.max(1, Math.round(rnd(1, spec.term))), rate: Math.round(rnd(0, 20) * 1000) / 1000 }]; if (trial % 8 === 2) spec.paymentHeld = true; }
    if (trial % 3 === 0) spec.lump = Math.round(rnd(0, 50000));
    if (trial % 7 === 0) spec.extra = Math.round(rnd(0, 500));
    const horizon = [12, 60, 120, 300, 600][trial % 5];
    const b = K.moneyBound(spec, "balance", "interest", horizon), g = 1 + b.i;
    const run = (bal) => E.plan(Object.assign({}, spec, { balance: bal }), b.N);
    for (const d of [0.01, 1, 250, 50000]) {
      const x = Math.round(rnd(1, spec.balance * 1.5) * 100) / 100;
      let p, q; try { p = run(x); q = run(x + d); } catch (err) { continue; }
      pairs++;
      let prevDelta = d, grow = d;
      for (let k = 0; k < p.rows.length && k < q.rows.length; k++) {
        const db = q.rows[k].balance - p.rows[k].balance, di = q.rows[k].interest - p.rows[k].interest;
        grow *= g;
        if (db < -1e-7 * (1 + x) || db > grow + 1e-7 * (1 + x)) s1++;
        if (di < -1e-7 * (1 + x) || di > b.i * prevDelta + 1e-7 * (1 + x)) s2++;
        prevDelta = Math.max(0, db);
      }
      for (const pl of [p, q]) {
        const start = pl === p ? x : x + d;
        const ins = pl.rows.reduce((t, r) => t + r.interest, 0), paid = pl.rows.reduce((t, r) => t + r.payment + (r.lump || 0) + (r.extra || 0), 0);
        const end = pl.rows.length ? pl.rows[pl.rows.length - 1].balance : start;
        if (Math.abs(paid - (ins + start - end)) > 1e-6 * (1 + start)) s3++;
      }
    }
    // Step 4, every money setting and both measures, the unwidened K.
    const prop = ["balance", "lump", "extra"][trial % 3], measure = trial % 2 ? "paid" : "interest";
    const bb = K.moneyBound(spec, prop, measure, horizon), K0 = bb.K / 1.25;
    const f = (c) => E.over(E.plan(Object.assign({}, spec, { [prop]: c / 100 }), bb.N), horizon)[measure];
    for (const dc of [1, 100, 10000, 1000000]) {
      const x = Math.round(rnd(prop === "balance" ? 100 : 0, prop === "extra" ? 500000 : spec.balance * 150));
      let fa, fb; try { fa = f(x); fb = f(x + dc); } catch (err) { continue; }
      plans++;
      const r = Math.abs(fb - fa) / (K0 * dc / 100 + 1e-9);
      if (r > 1 + 1e-9) s4++; worst4 = Math.max(worst4, r);
    }
  }
  ok("derivation: many balance pairs walked payment by payment (" + pairs + ")", pairs > 3000);
  eq("derivation step 1: a later balance never falls and grows by at most (1 + i) per payment", s1, 0);
  eq("derivation step 2: interest moves by at most i times the balance it starts from", s2, 0);
  eq("derivation step 3: paid = interest + start balance - end balance, exactly", s3, 0);
  ok("derivation step 4: many pairs for the unwidened K (" + plans + ")", plans > 3000);
  eq("derivation step 4: K holds with no safety margin (worst " + worst4.toFixed(3) + " of it)", s4, 0);
  ok("derivation step 4: and it is close to tight", worst4 > 0.9);
}

done("certified money break even");
