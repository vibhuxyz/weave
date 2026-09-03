/**
 * Build: run the order summary report and check the collapse happened.
 *
 * The three original functions are the existing callers — they must keep
 * returning what they always returned. `summarize` must exist and be able to
 * do what the duplicated functions did, for a status none of them special-case.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { countPending, countShipped, countCancelled } from "./src/orders.js";

const orders = [
  { status: "pending", total: 10 },
  { status: "pending", total: 5.505 },
  { status: "shipped", total: 20 },
  { status: "cancelled", total: 1 },
];

const problems = [];
const check = (label, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    problems.push(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
};

check("countPending unchanged", countPending(orders), { count: 2, value: 15.51 });
check("countShipped unchanged", countShipped(orders), { count: 1, value: 20 });
check("countCancelled unchanged", countCancelled(orders), { count: 1, value: 1 });
check("countPending of empty input", countPending([]), { count: 0, value: 0 });

const module = await import("./src/orders.js");
if (typeof module.summarize !== "function") {
  problems.push("src/orders.js does not export a function named summarize");
} else {
  check("summarize('pending', ...)", module.summarize("pending", orders), { count: 2, value: 15.51 });
  check("summarize('shipped', ...)", module.summarize("shipped", orders), { count: 1, value: 20 });
  check("summarize covers a status none of the three wrappers handle", module.summarize("refunded", orders), { count: 0, value: 0 });
}

if (problems.length > 0) {
  console.error("build failed: collapse incomplete or callers broke");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

await mkdir(new URL("./dist/", import.meta.url), { recursive: true });
await writeFile(
  new URL("./dist/report.json", import.meta.url),
  JSON.stringify({ pending: countPending(orders), shipped: countShipped(orders) }, null, 2),
);
console.log("build ok: callers unchanged, summarize present");
