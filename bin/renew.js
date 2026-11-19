#!/usr/bin/env node
// renew run FILE [--input name=value ...] [--json]
//                                          run a program and print the report, optionally changing its inputs;
//                                          --json prints the result blocks as JSON instead of text
// renew compile FILE [--module]            print the compiled JavaScript (save it and run it with node),
//                                          or an ES module that exports run(inputs) and inputs
// renew check FILE                         only parse and type check
const fs = require("fs");
const path = require("path");
const Renew = require(path.join(__dirname, "..", "src", "renew.js"));
const args = process.argv.slice(2);
const [cmd, file] = args;
const usage = () => { process.stderr.write("Usage: renew run FILE.renew [--input name=value ...] [--json] | renew compile FILE.renew [--module] | renew check FILE.renew\n"); process.exit(2); };
if (!cmd || !file || !["run", "compile", "check"].includes(cmd)) usage();
const inputs = {};
let moduleMode = false, json = false;
for (let i = 2; i < args.length; i++) {
  if (cmd === "run" && args[i] === "--input" && /^[^=]+=/.test(args[i + 1] || "")) { const t = args[++i]; inputs[t.slice(0, t.indexOf("="))] = t.slice(t.indexOf("=") + 1); }
  else if (cmd === "compile" && args[i] === "--module") moduleMode = true;
  else if (cmd === "run" && args[i] === "--json") json = true;
  else usage();
}
const src = fs.readFileSync(file, "utf8");
try {
  if (cmd === "run") { const r = Renew.run(src, { inputs }); process.stdout.write(json ? JSON.stringify({ blocks: r.blocks }, null, 2) + "\n" : r.text); }
  else if (cmd === "compile") process.stdout.write(Renew.compile(src, { module: moduleMode }));
  else { Renew.check(Renew.parse(src)); process.stdout.write(file + ": no problems found\n"); }
} catch (err) {
  process.stderr.write(file + "\n" + Renew.formatError(err, src) + "\n");
  process.exit(1);
}
