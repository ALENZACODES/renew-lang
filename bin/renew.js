#!/usr/bin/env node
// renew run FILE [--input name=value ...]  run a program and print the report, optionally changing its inputs
// renew compile FILE [--module]            print the compiled JavaScript (save it and run it with node),
//                                          or an ES module that exports run(inputs) and inputs
// renew check FILE                         only parse and type check
const fs = require("fs");
const path = require("path");
const Renew = require(path.join(__dirname, "..", "src", "renew.js"));
const args = process.argv.slice(2);
const [cmd, file] = args;
const usage = () => { process.stderr.write("Usage: renew run FILE.renew [--input name=value ...] | renew compile FILE.renew [--module] | renew check FILE.renew\n"); process.exit(2); };
if (!cmd || !file || !["run", "compile", "check"].includes(cmd)) usage();
const inputs = {};
let moduleMode = false;
for (let i = 2; i < args.length; i++) {
  if (cmd === "run" && args[i] === "--input" && /^[^=]+=/.test(args[i + 1] || "")) { const t = args[++i]; inputs[t.slice(0, t.indexOf("="))] = t.slice(t.indexOf("=") + 1); }
  else if (cmd === "compile" && args[i] === "--module") moduleMode = true;
  else usage();
}
const src = fs.readFileSync(file, "utf8");
try {
  if (cmd === "run") process.stdout.write(Renew.run(src, { inputs }).text);
  else if (cmd === "compile") process.stdout.write(Renew.compile(src, { module: moduleMode }));
  else { Renew.check(Renew.parse(src)); process.stdout.write(file + ": no problems found\n"); }
} catch (err) {
  process.stderr.write(file + "\n" + Renew.formatError(err, src) + "\n");
  process.exit(1);
}
