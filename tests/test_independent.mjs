// Independent figures: tests/verify/independent.py is a separate Python implementation with decimal
// arithmetic that shares no code with the kernel. It writes tests/fixtures/independent.json: twelve Renew
// programs (several rate changes, extra payments, lump sums, accelerated and weekly payments, monthly
// compounding, short horizons inside and past a term, and variable rates with the payment held, with and
// without a renewal) and the figures Python gets for each. Here every program runs through the interpreter
// and through the compiler, and each figure must match to the cent.
import { Renew, eq, done, root } from "./helpers.mjs";
import { readFileSync } from "fs";
import { join } from "path";
import vm from "vm";
const fx = JSON.parse(readFileSync(join(root, "tests/fixtures/independent.json"), "utf8"));
function compiledBlocks(src) {
  const sandbox = { module: { exports: {} }, Math, Object, JSON, Number, String, Array, Error };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(Renew.compile(src), sandbox, { timeout: 5000 });
  return sandbox.module.exports.blocks;
}
function figures(block) {
  const col = (start) => block.columns.findIndex((c) => c.startsWith(start));
  const row = block.raw[0];
  return { payment: row[col("Payment")], interest: row[col("Interest over")], paid: row[col("Paid over")], balance: row[col("Balance after")], payoff: row[col("Time to pay off")] };
}
eq("twelve independent cases", fx.cases.length, 12);
for (const c of fx.cases) {
  for (const [how, blocks] of [["interpreter", Renew.run(c.program).blocks], ["compiler", compiledBlocks(c.program)]]) {
    const got = figures(blocks[0]);
    for (const k of ["payment", "interest", "paid", "balance", "payoff"]) eq(c.id + ", " + how + ": " + k, got[k], c.want[k]);
  }
}
done("independent figures");
