/**
 * Build: run a small reservation scenario and write the resulting ledger.
 *
 * `reserve`/`release`/`available` do not exist in this repo yet — that is the
 * feature being added. The build fails with a clear import error until they
 * do, which is a legitimate build failure, not a test failure: a build that
 * imports a symbol nobody has written yet does not produce an artifact.
 */
import { writeFile, mkdir } from "node:fs/promises";
import {
  createInventory,
  onHand,
  receive,
  ship,
  reserve,
  release,
  available,
} from "./src/inventory.js";

const problems = [];
const check = (label, actual, expected) => {
  if (actual !== expected) problems.push(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

// Existing behaviour must still hold.
const inv = createInventory({ widget: 10 });
receive(inv, "widget", 5);
check("onHand after receive", onHand(inv, "widget"), 15);
ship(inv, "widget", 3);
check("onHand after ship", onHand(inv, "widget"), 12);

// New behaviour: reservations hold stock without shipping it.
const inv2 = createInventory({ widget: 10 });
reserve(inv2, "widget", 4);
check("onHand unchanged by reserve", onHand(inv2, "widget"), 10);
check("available after reserve", available(inv2, "widget"), 6);

release(inv2, "widget", 3);
check("available after partial release", available(inv2, "widget"), 9);

let overReserved = false;
try {
  reserve(inv2, "widget", 100);
} catch {
  overReserved = true;
}
if (!overReserved) problems.push("reserving past available stock did not throw");

const inv3 = createInventory({ widget: 10 });
reserve(inv3, "widget", 4);
ship(inv3, "widget", 4);
check("onHand after shipping a reservation", onHand(inv3, "widget"), 6);
check("available after shipping a reservation", available(inv3, "widget"), 6);

if (problems.length > 0) {
  console.error("build failed: reservation scenario did not produce the expected ledger");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

await mkdir(new URL("./dist/", import.meta.url), { recursive: true });
await writeFile(
  new URL("./dist/ledger.json", import.meta.url),
  JSON.stringify({ onHand: onHand(inv3, "widget"), available: available(inv3, "widget") }, null, 2),
);
console.log("build ok: reservation scenario reconciled");
