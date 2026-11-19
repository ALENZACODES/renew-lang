// The compiler must agree with the interpreter, byte for byte, on every example and on random programs.
import { Renew, eq, ok, done, root, require } from "./helpers.mjs";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import vm from "vm";

function runCompiled(js) {
  const sandbox = { module: { exports: {} }, require: () => { throw new Error("compiled code must not require anything"); }, Math, Object, JSON, Number, String, Array, Error };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(js, sandbox, { timeout: 5000 });
  return sandbox.module.exports.report;
}
for (const f of readdirSync(join(root, "examples")).filter((x) => x.endsWith(".renew"))) {
  const src = readFileSync(join(root, "examples", f), "utf8");
  eq("example " + f, runCompiled(Renew.compile(src)), Renew.run(src).text);
}

// Random programs from a fixed seed, so a failure can be replayed. Each one uses every statement
// (mortgage, scenario with and without from, let, compare with and without over, sweep, show of a value,
// show schedule, show yearly, explain, check), every measure, both solvers, posted and typed rates,
// all three compounding choices, all six payment frequencies, extra, lump, renews at, and the fixed and
// variable labels. Error paths are covered in test_language.mjs and test_round2.mjs, not here.
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
    'compare all by payment, yearly, interest, principal, balance, total, rate, payoff, three months interest',
    'show payment of "Alt" - payment of "Base"',
    'show (interest of "Alt" + principal of "Alt") / 2',
    'check payment of "Base" <= budget',
    'show rate needed for "Base" at budget',
    'show amortization needed for "Alt" at budget * 1.5',
    'show schedule "Alt" first ' + (1 + Math.floor(rnd() * 12)),
    'show yearly "Base"',
    'explain "Alt"',
    // Round 2 features: equal horizons, renews at, sweeps and the variable label.
    'scenario "Short" from "Base"',
    '  term 1 year',
    '  rate ' + (Math.round(rnd() * 800) / 100 + 0.5) + '% ' + pick(["fixed", "variable"]),
    rnd() < 0.6 ? '  renews at ' + (Math.round(rnd() * 800) / 100 + 0.5) + '%' : '  payments ' + pick(Renew.FREQS),
    'compare all by payment, interest, principal, total, balance, payoff over ' + pick(["1 year", "3 years", "5 years", "7 years 6 months"]),
    'sweep "Short" ' + pick(['rate from 3% to 6% step 0.75%', 'renews from 4% to 6% step 0.5%', 'extra from $0 to $300 step $100', 'amortization from 10 years to 25 years step 5 years']) + (rnd() < 0.5 ? ' over 5 years' : ''),
    'explain "Short"'
  ];
  const src = lines.join("\n");
  let want;
  try { want = Renew.run(src).text; } catch (e) { ok("random program " + t + " should run: " + e.message + "\n" + src, false); continue; }
  const got = runCompiled(Renew.compile(src));
  if (got !== want) { eq("random program " + t + "\n" + src, got, want); break; }
  eq("random program " + t, got, want);
}

// Compiled code is self contained: no require, and posted rates are folded in as cited constants.
const js = Renew.compile('mortgage "A"\n  balance $5,000\n  rate posted 5 year on 2026-11-18\n  amortization 5 years\n  term 1 year\nshow payment of "A"');
ok("no require in output", !/\brequire\(/.test(js.split("\n").filter((l) => !l.includes("typeof require")).join("\n")));
ok("posted rate folded with citation", js.includes("/* Bank of Canada V80691335, week of 2026-11-18 */ 6.19"));
ok("compiled program says where each line came from", js.includes("// line 1: mortgage \"A\""));
done("compiler");
