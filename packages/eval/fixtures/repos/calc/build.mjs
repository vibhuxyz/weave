/**
 * Build: close every ledger in data/ and write the balances to dist/.
 *
 * This is the project's own build gate, not a test suite. It fails when a
 * ledger does not reconcile — which is what a broken `subtract` produces, and
 * which is a thing a real accounting build refuses to ship.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { add, subtract, percentOf } from "./src/calc.js";

const ledgers = JSON.parse(await readFile(new URL("./data/ledger.json", import.meta.url), "utf8"));
const problems = [];
const closed = [];

for (const ledger of ledgers) {
  let balance = ledger.opening;
  for (const credit of ledger.credits) balance = add(balance, credit);
  for (const debit of ledger.debits) balance = subtract(balance, debit);

  const credited = ledger.credits.reduce((sum, value) => sum + value, 0);
  const debited = ledger.debits.reduce((sum, value) => sum + value, 0);
  const expected = ledger.opening + credited - debited;

  if (Math.abs(balance - expected) > 1e-9) {
    problems.push(
      `${ledger.id}: closes at ${balance}, but opening + credits - debits is ${expected}`,
    );
  }
  if (balance < 0) {
    problems.push(`${ledger.id}: closing balance is negative (${balance})`);
  }

  closed.push({ id: ledger.id, balance, fee: percentOf(balance, 2) });
}

if (problems.length > 0) {
  console.error("build failed: ledgers do not reconcile");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

await mkdir(new URL("./dist/", import.meta.url), { recursive: true });
await writeFile(
  new URL("./dist/balances.json", import.meta.url),
  JSON.stringify(closed, null, 2),
);
console.log(`build ok: ${closed.length} ledgers closed`);
