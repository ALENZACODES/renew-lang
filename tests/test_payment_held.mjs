// A variable rate with its payment held: the payment stays the same when the rate changes inside the term,
// the time to pay off moves, the trigger rate is reported, and a rate past the trigger is an error. At
// renewal the payment is worked out again over the amortization left. Figures marked (independent) come
// from tests/verify/independent.py or from a closed form written here, not from the kernel.
import { Renew, eq, ok, near, throwsAt, done, root } from "./helpers.mjs";
import { readFileSync } from "fs";
import { join } from "path";
import vm from "vm";
const K = Renew.kernel;
const ex5 = readFileSync(join(root, "examples/05-payment-held.renew"), "utf8");
const r = Renew.run(ex5);
const cmp = r.blocks[0];
const row = (name) => cmp.raw.find((x) => x[0] === name);
// 1. The payment stays, so less goes to the principal and the loan runs longer.
eq("same first payment both ways", JSON.stringify([row("Payment adjusts")[1], row("Payment held")[1]]), "[2147.67,2147.67]");
eq("fixed payment: interest over 3 years (independent)", row("Payment held")[2], 61310.67);
eq("fixed payment: balance after 3 years (independent)", row("Payment held")[3], 383994.55);
eq("fixed payment: time to pay off 33 years 8 months (independent)", row("Payment held")[4], 404);
eq("adjusting payment still pays off in 25 years", row("Payment adjusts")[4], 300);
eq("payoff shown in words", cmp.rows.find((x) => x[0] === "Payment held")[4], "33 years 8 months");
// 2. The trigger rate: 2 x ((1 + 2147.67 / 400000) ^ (12 / 2) - 1), floored to a thousandth (independent).
const trig = Math.floor(2 * (Math.pow(1 + 2147.67 / 400000, 6) - 1) * 100 * 1000) / 1000;
eq("trigger rate closed form", trig, 6.53);
eq("trigger rate measure", r.blocks[1].text, 'trigger rate of "Payment held" = 6.53%');
eq("trigger rate value for --json", JSON.stringify([r.blocks[1].value, r.blocks[1].type]), '[6.53,"percent"]');
ok("trigger rate column in the compare", cmp.columns.includes("Trigger rate"));
ok("note says the payment stays and gives the trigger rate", cmp.notes.some((n) => n.startsWith('Variable rate, payment held: "Payment held" keeps its payment of $2,147.67') && n.includes("trigger rate at the start, where the payment only covers the interest, is 6.53%")));
const ex = r.blocks[2].lines;
ok("explain gives the trigger formula", ex.some((l) => l.includes("Trigger rate at the start: the payment only covers the interest at 6.53% = 2 x ((1 + $2,147.67 / $400,000.00) ^ (12 / 2) - 1).")));
ok("explain gives the change with the payment kept", ex.includes("Rate path, 6 months from the start: the rate becomes 5.5%. The payment stays at $2,147.67. Interest on the balance left, $395,401.68, is now $1,791.83 a payment, and the trigger rate on that balance is 6.607%."));
// interest on $395,401.68 at 5.5%: i = 1.0275 ^ (1/6) - 1 (independent)
eq("interest a payment after the change (independent)", Math.round(395401.68 * (Math.pow(1.0275, 1 / 6) - 1) * 100) / 100, 1791.83);
// 3. At renewal the payment is worked out again over what is left: 25 years minus 3 years = 264 months.
const i5 = Math.pow(1.025, 1 / 6) - 1, closed = Math.round(383994.55 * i5 / (1 - Math.pow(1 + i5, -264)) * 100) / 100;
eq("renewal payment closed form (independent)", closed, 2389.93);
eq("renewal payment", r.blocks[3].text, 'renewal payment of "Fixed, then renews" = $2,389.93');
eq("the check passes", r.blocks[4].pass, true);
// 4. Past the trigger: an error at the plan, naming the rate, the month and the trigger rate.
const base = 'mortgage "V"\n  balance $400,000\n  rate 4.2% then 7.5% after 6 months payment held\n  amortization 25 years\n  term 3 years\nshow payment of "V"\n';
throwsAt("rate past the trigger is an error", base, 1, 1, "no longer covers the interest");
try { Renew.run(base); } catch (e) { ok("error names rate, month and trigger", e.message.includes("at 7.5%, 6 months from the start") && e.message.includes("The trigger rate for this payment on that balance is 6.607%")); }
const compiled = (src) => { const sb = { module: { exports: {} }, Math, Object, JSON, Number, String, Array, Error }; sb.globalThis = sb; vm.runInNewContext(Renew.compile(src), sb); return sb.module.exports.report; };
try { compiled(base); ok("compiled program refuses too", false); } catch (e) { ok("compiled program refuses too, with the line", e.message.startsWith("Line 1: ") && e.message.includes("no longer covers the interest")); }
throwsAt("payment fixed was renamed", 'mortgage "F"\n  balance $1,000\n  rate 4% variable payment fixed\n  amortization 5 years\n  term 1 year\n', 3, 20, "Write payment held");
throwsAt("payment held is for a variable rate", 'mortgage "F"\n  balance $1,000\n  rate 4% fixed payment held\n  amortization 5 years\n  term 1 year\n', 3, 17, "payment held is for a variable rate");
throwsAt("a sweep past the trigger names the row", base.replace("7.5%", "5.5%") + 'sweep "V" rate from 2% to 4% step 1%\n', 7, null, "At rate 2%");
// 5. Labels and inheritance: payment held marks the rate variable; a scenario that sets a new rate without
// payment held is an ordinary adjustable plan again.
const inh = 'mortgage "V"\n  balance $400,000\n  rate 4.2% then 5.5% after 6 months payment held\n  amortization 25 years\n  term 3 years\nscenario "W"\n  rate 4.2% then 5.5% after 6 months\ncompare by payment, payoff\n';
const ri = Renew.run(inh), rows = ri.blocks[0].raw;
eq("inherited plan without payment held adjusts again", JSON.stringify([rows[0][2], rows[1][2]]), "[404,300]");
eq("plan spec is marked variable", Renew.run(inh).plans[0].spec.rateKind, "variable");
// 6. With no rate change, payment held changes nothing.
const flat = 'mortgage "A"\n  balance $250,000\n  rate 5% payment held\n  amortization 20 years\n  term 5 years\nmortgage "B"\n  balance $250,000\n  rate 5%\n  amortization 20 years\n  term 5 years\ncompare by payment, interest, balance, payoff\n';
const rf = Renew.run(flat).blocks[0].raw;
eq("no change, same plan", JSON.stringify(rf[0].slice(1)), JSON.stringify(rf[1].slice(1)));
// 7. The kernel trigger formula against a direct check: at the trigger rate the interest equals the payment.
const tr = K.triggerRate(1000, 200000, 2, 12) / 100, iT = Math.pow(1 + tr / 2, 2 / 12) - 1;
near("at the trigger rate the interest equals the payment", 200000 * iT, 1000, 1e-6);

// 8. Trigger-rate boundary: just under the later trigger still runs; one step over is refused.
// The refused file is not in the playground bundle. Renew does not model lender options
// such as raising the payment, converting to a fixed rate, asking for a lump, or letting the balance grow.
const underSrc = readFileSync(join(root, "examples/06-trigger-boundary.renew"), "utf8");
const ru = Renew.run(underSrc);
eq("just under: trigger at the start", ru.blocks[0].value, 6.53);
eq("just under: payment stays held", ru.blocks[1].value, 2147.67);
// Round 7: the old 100 year stop made this read "100 years", as if the loan were repaid then. The loop now runs
// to the real payoff (limit 1,000 years), and the Python check in tests/verify/independent.py gets the same
// 106 years 1 month, which is 105 years 7 months after the change to 6.60%.
eq("just under: payoff is the real one, past the old 100 year stop", ru.blocks[2].value, 1273);
eq("just under: payoff in words", ru.blocks[2].text, 'payoff of "Just under" = 106 years 1 month');
ok("just under: the note says it is a calculation, a mathematical projection, not a contract term", ru.blocks[2].notes.some((n) => n.includes("would take 106 years 1 month to pay off at its held payment, longer than its amortization of 25 years") && n.includes("a mathematical projection, not a contract term")));
ok("just under: explain carries the same note", ru.blocks[3].lines.some((l) => l.includes("a mathematical projection, not a contract term")));
eq("just under: not capped", ru.plans[0].payoffCapped, false);
// A plan that reaches the 1,000 year limit says it is not repaid, and does not show the limit as a payoff.
// No real plan was found that gets there: a $1 billion balance at the highest rate under the trigger still
// pays off in 318 years 8 months. So the note is checked on a plan object marked as capped.
ok("capped: note says not repaid", K.stretchNote({ name: "X", payoff: 12000, payoffCapped: true, spec: { paymentHeld: true, amortization: 300 } }).includes("is not repaid within 1000 years"));
{
  const big = K.plan(Object.assign({}, ru.plans[0].spec, { balance: 1e9, ratePath: [{ rate: 6.6070994911641145, after: 6 }] }));
  eq("a $1 billion balance just under the trigger still pays off inside the limit", JSON.stringify([big.payoff, big.payoffCapped]), "[3824,false]");
}
eq("payoff limit is 1,000 years", K.PAYOFF_LIMIT_YEARS, 1000);
ok("example 05: the held payment's 33 years 8 months gets the same note", Renew.run(readFileSync(join(root, "examples/05-payment-held.renew"), "utf8")).blocks.some((b) => (b.notes || []).some((n) => n.includes("would take 33 years 8 months to pay off at its held payment"))));
ok("just under: explain names the later trigger", ru.blocks[3].lines.join(" ").includes("the trigger rate on that balance is 6.607%"));
const refusedSrc = readFileSync(join(root, "examples/refused/trigger-crossed.renew"), "utf8");
throwsAt("just over the later trigger is refused", refusedSrc, 16, null, "at 6.61%, 6 months from the start");
ok("just over names the later trigger in the error", (() => { try { Renew.run(refusedSrc); return false; } catch (e) { return e.message.includes("The trigger rate for this payment on that balance is 6.607%") && e.message.includes("Renew does not let a balance grow"); } })());

done("payment held");
