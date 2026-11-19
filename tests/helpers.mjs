import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
export const require = createRequire(import.meta.url);
export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const Renew = require(join(root, "src/renew.js"));
let passed = 0, failed = 0;
export function eq(name, got, want) {
  if (got === want) { passed++; return; }
  failed++; console.error("FAIL " + name + "\n  got:  " + JSON.stringify(got) + "\n  want: " + JSON.stringify(want));
}
export function ok(name, cond) { eq(name, !!cond, true); }
export function near(name, got, want, tol) { if (Math.abs(got - want) <= tol) { passed++; return; } failed++; console.error("FAIL " + name + " got " + got + " want " + want + " within " + tol); }
export function throwsAt(name, src, line, col, fragment) {
  try { Renew.run(src); failed++; console.error("FAIL " + name + ": no error"); }
  catch (e) {
    if (!(e instanceof Renew.RenewError)) { failed++; console.error("FAIL " + name + ": not a RenewError: " + e.stack); return; }
    eq(name + " line", e.line, line); if (col) eq(name + " col", e.col, col);
    if (fragment) ok(name + " message has " + JSON.stringify(fragment) + " (got " + JSON.stringify(e.message + " " + e.hint) + ")", (e.message + " " + e.hint).includes(fragment));
  }
}
export function done(label) {
  if (failed) { console.error(label + ": " + failed + " failed, " + passed + " passed"); process.exit(1); }
  console.log(label + ": " + passed + " passed");
}
