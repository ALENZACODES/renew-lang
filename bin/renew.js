#!/usr/bin/env node
// renew run FILE      run a program and print the report
// renew compile FILE  print the compiled JavaScript (save it and run it with node)
// renew check FILE    only parse and type check
const fs = require("fs");
const path = require("path");
const Renew = require(path.join(__dirname, "..", "src", "renew.js"));
const [cmd, file] = process.argv.slice(2);
if (!cmd || !file || !["run", "compile", "check"].includes(cmd)) {
  process.stderr.write("Usage: renew run|compile|check FILE.renew\n");
  process.exit(2);
}
const src = fs.readFileSync(file, "utf8");
try {
  if (cmd === "run") process.stdout.write(Renew.run(src).text);
  else if (cmd === "compile") process.stdout.write(Renew.compile(src));
  else { Renew.check(Renew.parse(src)); process.stdout.write(file + ": no problems found\n"); }
} catch (err) {
  process.stderr.write(file + "\n" + Renew.formatError(err, src) + "\n");
  process.exit(1);
}
