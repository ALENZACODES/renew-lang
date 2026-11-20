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
done("certified money break even");
