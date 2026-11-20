// Lexer, parser, checker and interpreter behaviour, including the error messages people will see.
import { Renew, eq, ok, throwsAt, done, root } from "./helpers.mjs";
import { readFileSync } from "fs";
import { join } from "path";
const base = 'mortgage "Home"\n  balance $100,000\n  rate 5%\n  amortization 25 years\n  term 5 years\n';

// Values and units
const r = Renew.run(base + 'let x = $1,000 * 2\nlet y = 3% + 1.5%\nlet z = $400,000 * 1%\nlet d = 2 years 6 months\nshow x\nshow y\nshow z\nshow d\nshow d / 6 months\nshow max($5, $7)\nshow -x');
eq("money times number", r.blocks[0].text, "x = $2,000.00");
eq("percent plus percent", r.blocks[1].text, "y = 4.5%");
eq("money times percent", r.blocks[2].text, "z = $4,000.00");
eq("duration literal", r.blocks[3].text, "d = 2 years 6 months");
eq("duration ratio", r.blocks[4].text, "d / 6 months = 5");
eq("max", r.blocks[5].text, "max($5.00, $7.00) = $7.00");
eq("negation", r.blocks[6].text, "-x = -$2,000.00");

// Scenarios inherit, override, and default to the mortgage above them.
const s = Renew.run(base + 'scenario "Higher"\n  rate 6%\nscenario "Faster" from "Home"\n  payments biweekly\ncompare all by rate, payment');
eq("compare rows", s.blocks[0].rows.map((x) => x[0]).join("|"), "Home|Higher|Faster");
eq("override rate", s.blocks[0].rows[1][1], "6%");
eq("inherit rate", s.blocks[0].rows[2][1], "5%");
ok("biweekly label", s.blocks[0].rows[2][2].endsWith("biweekly"));

// Comments, blank lines, CRLF and case
eq("crlf and comments", Renew.run('# hi\r\nMORTGAGE "A"   # note\r\n  Balance $1,000\r\n  rate 1%\r\n  amortization 1 year\r\n  term 1 year\r\n\r\nshow payment of "A"').blocks[0].text, 'payment of "A" = $83.78');

// Checks
const c = Renew.run(base + 'check payment of "Home" <= $600\ncheck payment of "Home" > $600\ncheck rate of "Home" == 5%');
eq("check pass", c.blocks[0].pass, true);
eq("check fail", c.blocks[1].pass, false);
eq("check percent equal", c.blocks[2].pass, true);
ok("check text shows both sides", c.blocks[0].text.includes("($581.60 <= $600.00)"));

// Posted rates come from the bundled Bank of Canada table, picking the latest week on or before the date.
const p = Renew.run('mortgage "P"\n  balance $1,000\n  rate posted 5 year on 2026-11-19\n  amortization 1 year\n  term 1 year\nshow rate of "P"');
eq("posted latest week", p.blocks[0].text, 'rate of "P" = 6.19%');
eq("posted 2021", Renew.run('mortgage "P"\n  balance $1,000\n  rate posted 5 year on 2021-11-17\n  amortization 1 year\n  term 1 year\nshow rate of "P"').blocks[0].text, 'rate of "P" = 4.79%');
eq("table first week", Renew.posted.dates[0], "2016-01-06");
eq("table last week", Renew.posted.dates[Renew.posted.dates.length - 1], "2026-11-18");
// Round 9: the six day cutoff. The code, docs/LANGUAGE.md and docs/INTEGRATION.md must say the same thing, word
// for word, and the code must do it: November 24 reads the November 18 week, November 25 is an error.
const postedOn = (d) => 'mortgage "P"\n  balance $1,000\n  rate posted 5 year on ' + d + '\n  amortization 1 year\n  term 1 year\nshow rate of "P"';
eq("posted six days after the last week reads that week", Renew.run(postedOn("2026-11-24")).blocks[0].text, 'rate of "P" = 6.19%');
throwsAt("posted seven days after the last week is an error", postedOn("2026-11-25"), 3, 8, "Use a date up to 2026-11-24");
const cutoff = "A date up to six days after the last week in the bundled copy reads that last week; a date later than that is an error. In this copy the last week is November 18, 2026, so dates from November 19 to November 24, 2026 read the November 18 week, and November 25, 2026 or later is an error.";
ok("LANGUAGE.md states the six day cutoff word for word", readFileSync(join(root, "docs/LANGUAGE.md"), "utf8").includes(cutoff));
ok("INTEGRATION.md states the same cutoff word for word", readFileSync(join(root, "docs/INTEGRATION.md"), "utf8").includes(cutoff));

// Errors point at the right place and say what to do.
throwsAt("unknown top word", base + "compair all", 6, 1, 'Did you mean "compare"?');
throwsAt("unknown setting", 'mortgage "A"\n  ballance $5', 2, 3, 'Did you mean "balance"?');
throwsAt("missing setting", 'mortgage "A"\n  balance $5\n  rate 1%\n  term 1 year', 1, 1, "needs a amortization");
throwsAt("rate without percent", 'mortgage "A"\n  balance $5\n  rate 5\n  amortization 1 year\n  term 1 year', 3, 8, "Add a percent sign, like 5%.");
throwsAt("balance without dollar", 'mortgage "A"\n  balance 5000\n  rate 5%\n  amortization 1 year\n  term 1 year', 2, 11, "Add a dollar sign");
throwsAt("term without unit", 'mortgage "A"\n  balance $5\n  rate 5%\n  amortization 1 year\n  term 5', 5, 8, "like 5 years");
throwsAt("money times money", base + "show $5 * $5", 6, 9, "Multiply money by a number");
throwsAt("compare across kinds", base + "check $5 < 5%", 6, 10, "Cannot compare an amount of money with a percentage");
throwsAt("unknown plan", base + 'show payment of "Hom"', 6, 17, 'Did you mean "Home"?');
throwsAt("unknown name", base + "show budgett", 6, 6, "No value is named");
throwsAt("set once", base + "let a = 1\nlet a = 2", 7, 1, "set once");
throwsAt("duplicate plan", base + base, 6, 10, "already used");
throwsAt("indent outside block", "  balance $5", 1, 3, "indented");
throwsAt("unclosed quote", 'mortgage "A', 1, 10, "closing quote");
throwsAt("bad comma", base + "show $1,00", 6, 6, "Commas");
throwsAt("strange character", base + "show $5 & $6", 6, 9, "does not use");
throwsAt("posted out of range", 'mortgage "A"\n  balance $5\n  rate posted 5 year on 2027-01-06\n  amortization 1 year\n  term 1 year', 3, 8, "will not guess");
throwsAt("posted bad term", 'mortgage "A"\n  balance $5\n  rate posted 2 year on 2026-01-06', 3, 15, "1, 3 and 5 year");
throwsAt("term longer than amortization", 'mortgage "A"\n  balance $5\n  rate 5%\n  amortization 1 year\n  term 2 years', 1, 1, "no longer than the amortization");
throwsAt("scenario without mortgage", 'scenario "A"\n  rate 5%', 1, 1, "needs a mortgage above it");
throwsAt("bad frequency", 'mortgage "A"\n  payments montly', 2, 12, 'Did you mean "monthly"?');
throwsAt("check needs comparison", base + 'check payment of "Home"', 6, 1, "check needs a comparison");
throwsAt("metric without plan", base + "show payment", 6, 6, 'Say which plan');
throwsAt("divide by zero", base + "show $5 / 0", 6, 9, "divides by zero");
throwsAt("solver target type", base + 'show rate needed for "Home" at 5%', 6, 32, "must be an amount of money");

// formatError draws a caret under the column.
try { Renew.run(base + "compair all"); } catch (e) {
  const lines = Renew.formatError(e, base + "compair all").split("\n");
  eq("caret line", lines[2], "  ^");
  eq("source line", lines[1], "  compair all");
}
done("language");
