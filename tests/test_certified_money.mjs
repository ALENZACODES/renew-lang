// Round 8: the money break even search has a coverage guarantee. An interval of amounts is skipped only when a
// proven bound on how fast the answer can move shows no amount inside it can change the answer; everything
// else is split down to single cents. These tests check the bound itself on random plans, compare the search
// with a brute force walk over every cent, and build an adversarial case with two changes 29 cents apart that
// the old sampled scan ($500 spacing) could not see.
import { Renew, eq, ok, done } from "./helpers.mjs";
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
done("certified money break even");
