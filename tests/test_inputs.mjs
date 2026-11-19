// One rule for input values, everywhere: a value is text written with its unit ("1%", "$3,000", "5 years"),
// the same as in a program. A JavaScript number is taken only for a plain number input. This file checks
// the rule in run(), in compiled code, in the ES module, on the command line and in the playground.
import { Renew, eq, ok, done, root } from "./helpers.mjs";
import { readFileSync, writeFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";
import vm from "vm";
const src = 'input disc = 1.5%\ninput more = $0\ninput amort = 25 years\ninput count = 12\n' +
  'mortgage "A"\n  balance $400,000\n  rate 5% - disc\n  amortization amort\n  term 5 years\n  extra more per payment\n' +
  'show payment of "A"\nshow count * $1\n';
const refuse = (fn) => { try { fn(); return null; } catch (e) { return e; } };
// run()
const ok1 = Renew.run(src, { inputs: { disc: "1%", more: "$100", amort: "20 years", count: "3" } });
ok("text with units is accepted", ok1.text.includes("count * $1.00 = $3.00"));
eq("number input takes a JavaScript number", Renew.run(src, { inputs: { count: 12 } }).blocks[1].value, 12);
eq("number input takes text", Renew.run(src, { inputs: { count: "12" } }).blocks[1].value, 12);
for (const [name, v, unit] of [["disc", 1, "1.5%"], ["more", 100, "$3,000"], ["amort", 240, "20 years"]]) {
  const e = refuse(() => Renew.run(src, { inputs: { [name]: v } }));
  ok("bare number refused for " + name, e && e.message.includes("written with its unit, like \"" + unit + "\". Got " + v + ". A number on its own does not say its unit, so pass it as text."));
}
eq("the refusal points at the input line", refuse(() => Renew.run(src, { inputs: { amort: 240 } })).line, 3);
ok("text with the wrong unit is refused", refuse(() => Renew.run(src, { inputs: { more: "100" } })).message.includes("must be an amount of money"));
ok("a duration in months is accepted", Renew.run(src, { inputs: { amort: "240 months" } }).text === Renew.run(src, { inputs: { amort: "20 years" } }).text);
// Compiled code and the ES module follow the same rule.
const js = Renew.compile(src);
const sb = { module: { exports: {} }, Math, Object, JSON, Number, String, Array, Error }; sb.globalThis = sb;
vm.runInNewContext(js, sb);
eq("compiled run with text", sb.module.exports.run({ disc: "1%", more: "$100", amort: "20 years", count: "3" }).report, ok1.text);
ok("compiled run refuses a bare number for a percentage", (refuse(() => sb.module.exports.run({ disc: 1 })) || {}).message?.includes("A number on its own does not say its unit"));
eq("compiled run takes a number for a number input", sb.module.exports.run({ count: 12 }).blocks[1].value, 12);
const m = await import(join(root, "examples/embed/renewal-2026.mjs"));
ok("the embed module refuses 1 for the discount", (refuse(() => m.run({ discount: 1 })) || {}).message?.includes("written with its unit"));
eq("the embed module takes \"1%\"", m.run({ discount: "1%" }).blocks.find((b) => b.type === "percent" && b.text.startsWith("break even")).value, 5.388);
// Command line: values always come as text, so --input discount=1 is refused with exit 1.
const dir = mkdtempSync(join(tmpdir(), "renewi-"));
writeFileSync(join(dir, "p.renew"), src);
const cli = (...a) => spawnSync(process.execPath, [join(root, "bin/renew.js"), "run", join(dir, "p.renew"), ...a], { encoding: "utf8" });
const c1 = cli("--input", "disc=1");
ok("CLI refuses disc=1 with exit 1", c1.status === 1 && c1.stderr.includes("must be a percentage, written with its unit"));
ok("CLI takes disc=1%", cli("--input", "disc=1%").status === 0);
ok("CLI takes count=12", cli("--input", "count=12").stdout.includes("count * $1.00 = $12.00"));
ok("CLI refuses amort=240", cli("--input", "amort=240").status === 1);
// Playground: the box text goes to run() unchanged, so the rule is the same there.
const app = readFileSync(join(root, "playground/app.js"), "utf8");
ok("playground passes the box text unchanged", app.includes("o[inp.dataset.name] = inp.value;"));
ok("playground hint names the unit", app.includes('percent: "a percentage, like 1.5%"'));
done("inputs");
