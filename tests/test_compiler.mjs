// The compiler must agree with the interpreter, byte for byte, on every example and on random programs.
import { Renew, eq, ok, done, root, require } from "./helpers.mjs";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import vm from "vm";

function runCompiled(js, want) {
  const sandbox = { module: { exports: {} }, require: () => { throw new Error("compiled code must not require anything"); }, Math, Object, JSON, Number, String, Array, Error };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(js, sandbox, { timeout: 5000 });
  return want === "blocks" ? JSON.stringify(sandbox.module.exports.blocks) : sandbox.module.exports.report;
}
for (const f of readdirSync(join(root, "examples")).filter((x) => x.endsWith(".renew"))) {
  const src = readFileSync(join(root, "examples", f), "utf8");
  eq("example " + f, runCompiled(Renew.compile(src)), Renew.run(src).text);
}

// Random programs from a fixed seed, so a failure can be replayed. Each one uses every statement
// (mortgage, scenario with and without from, let, compare with and without over, sweep, show of a value,
// show schedule, show yearly, explain, check), every measure, both solvers, posted and typed rates,
// all three compounding choices, all six payment frequencies, extra, lump, renews at, and the fixed and
// variable labels, plus sweep against, renewal payment, rate differences in percentage points and the
// variable rate notes on single values, input, rate paths, renewal paths, amortization to fit, amortization
// remaining from, break even on every setting, a variable rate with its payment fixed, the trigger rate and
// continuation lines. The structured blocks behind renew run --json must match too. Error paths are covered
// in test_language.mjs, test_horizons_and_sweeps.mjs, test_paths_break_even_inputs.mjs and
// test_fixed_payment.mjs, not here.
let seed = 20261119;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
for (let t = 0; t < 300; t++) {
  const years = 5 + Math.floor(rnd() * 26), term = 1 + Math.floor(rnd() * 5);
  const lines = [
    'let budget = $' + (1500 + Math.floor(rnd() * 3000)),
    'mortgage "Base"',
    '  balance $' + (50000 + Math.floor(rnd() * 950000)).toLocaleString("en-CA"),
    '  rate ' + (rnd() < 0.3 ? 'posted ' + pick([1, 3, 5]) + ' year on 20' + pick(["17", "19", "21", "23", "25"]) + '-0' + (1 + Math.floor(rnd() * 9)) + '-15' : (Math.round(rnd() * 900) / 100) + '%'),
    '  compounded ' + pick(["semi-annually", "monthly", "annually"]),
    '  amortization ' + years + ' years' + (rnd() < 0.3 ? ' 6 months' : ''),
    '  term ' + term + ' years',
    'scenario "Alt"',
    '  payments ' + pick(Renew.FREQS),
    rnd() < 0.5 ? '  extra $' + Math.floor(rnd() * 500) + ' per payment' : '  rate ' + (Math.round(rnd() * 900) / 100 + 0.5) + '%',
    rnd() < 0.5 ? '  lump $' + Math.floor(rnd() * 20000) + ' every year' : '  term ' + term + ' years',
    'compare all by payment, yearly, interest, principal, balance, paid, rate, payoff, three months interest, renewal payment',
    'show payment of "Alt" - payment of "Base"',
    'show (interest of "Alt" + principal of "Alt") / 2',
    'check payment of "Base" <= budget',
    'show rate needed for "Base" at budget',
    'show amortization needed for "Alt" at budget * 1.5',
    'show schedule "Alt" first ' + (1 + Math.floor(rnd() * 12)),
    'show yearly "Base"',
    'explain "Alt"',
    // Equal horizons, renews at, sweeps and the variable label.
    'scenario "Short" from "Base"',
    '  term 1 year',
    '  rate ' + (Math.round(rnd() * 800) / 100 + 0.5) + '% ' + pick(["fixed", "variable"]),
    rnd() < 0.6 ? '  renews at ' + (Math.round(rnd() * 800) / 100 + 0.5) + '%' : '  payments ' + pick(Renew.FREQS),
    'compare all by payment, interest, principal, paid, balance, payoff over ' + pick(["1 year", "3 years", "5 years", "7 years 6 months"]),
    'sweep "Short" ' + pick(['rate from 3% to 6% step 0.75%', 'renews from 4% to 6% step 0.5%', 'extra from $0 to $300 step $100', 'amortization from 10 years to 25 years step 5 years']) + (rnd() < 0.5 ? ' over 5 years' : ''),
    'explain "Short"',
    // Sweeps against a plan, renewal payment, rate differences in points, value notes for variable plans.
    'sweep "Short" renews from 3% to 6% step 1% by payment, renewal payment, interest, paid, balance over ' + pick(["3 years", "5 years"]) + ' against "Base"',
    'show rate of "Short" - rate of "Base"',
    'show renewal payment of "Short" - payment of "Short"'
  ];
  // Input, rate paths inside the term, renewal paths, amortization to fit, remaining from, break even and
  // continuation lines, then a variable rate with its payment fixed and break even on another setting.
  const T = term * 12, n1 = 1 + Math.floor(rnd() * (T / 2)), n2 = 1 + Math.floor(rnd() * (T - n1 - 1 || 1));
  const r4 = [
    'input bump = ' + (Math.round(rnd() * 100) / 100) + '%',
    'scenario "Var" from "Base"',
    '  rate ' + (Math.round(rnd() * 600) / 100 + 1) + '% + bump variable then ' + (Math.round(rnd() * 600) / 100 + 1) + '% after ' + n1 + ' months' + (n1 + n2 < T ? ' then ' + (Math.round(rnd() * 600) / 100 + 1) + '% after ' + n2 + ' months' : ''),
    'scenario "Steps" from "Base"',
    '  term 1 year',
    '  rate ' + (Math.round(rnd() * 600) / 100 + 1) + '%',
    '  renews at ' + (Math.round(rnd() * 600) / 100 + 1) + '% then ' + (Math.round(rnd() * 600) / 100 + 1) + '% after ' + pick(["1 year", "2 years", "18 months"]),
    'scenario "Fit" from "Base"',
    '  term 1 year',
    '  amortization to fit payment of "Base" + $' + Math.floor(rnd() * 100),
    'scenario "One" from "Base"',
    '  term 1 year',
    '  rate ' + (Math.round(rnd() * 600) / 100 + 1) + '%',
    'compare "Base", "Var",',
    '    "Steps", "Fit", "One"',
    '    by payment, renewal payment, interest, paid, balance, payoff',
    '    over ' + pick(["3 years", "5 years"]),
    'explain "Var"',
    'explain "Steps"',
    'show payoff of "Fit"',
    'show break even renews for "One" against "Base"',
    '    by ' + pick(["interest", "paid"]) + ' over ' + pick(["2 years", "5 years"]),
    'show break even renews for "One" against "Var" by interest over 3 years',
    'scenario "Fixed pay" from "Base"',
    (() => { const x = Math.round(rnd() * 500) / 100 + 1; return '  rate ' + x + '% then ' + Math.round((x + rnd()) * 100) / 100 + '% after ' + n1 + ' months payment fixed'; })(),
    'compare "Base", "Fixed pay" by payment, interest, balance, payoff, trigger rate over ' + pick(["3 years", "5 years"]),
    'show trigger rate of "Fixed pay"',
    'explain "Fixed pay"',
    'show break even ' + pick(["rate", "balance", "extra", "lump", "amortization", "term"]) + ' for "One" against "Base" by ' + pick(["interest", "paid"]) + ' over 5 years',
  ];
  if (years > term + 1) r4.push('scenario "Next" from "Base"', '  amortization remaining from "Base"', '  term 1 year', 'show payment of "Next"');
  lines.push(...r4);
  const src = lines.join("\n");
  let want;
  try { want = Renew.run(src).text; } catch (e) { ok("random program " + t + " should run: " + e.message + "\n" + src, false); continue; }
  const js = Renew.compile(src), got = runCompiled(js);
  if (got !== want) { eq("random program " + t + "\n" + src, got, want); break; }
  eq("random program " + t, got, want);
  eq("random program " + t + " blocks", runCompiled(js, "blocks"), JSON.stringify(Renew.run(src).blocks));
}

// Compiled code is self contained: no require, and posted rates are folded in as cited constants.
const js = Renew.compile('mortgage "A"\n  balance $5,000\n  rate posted 5 year on 2026-11-18\n  amortization 5 years\n  term 1 year\nshow payment of "A"');
ok("no require in output", !/\brequire\(/.test(js.split("\n").filter((l) => !l.includes("typeof require")).join("\n")));
ok("posted rate folded with citation", js.includes("/* Bank of Canada V80691335, week of 2026-11-18 */ 6.19"));
ok("compiled program says where each line came from", js.includes("// line 1: mortgage \"A\""));
done("compiler");
