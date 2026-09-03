/**
 * Build: render a fixed invoice and check the extraction happened.
 *
 * Two independent gates: (1) `invoice.js`'s observable output must be
 * byte-identical to before the refactor — a refactor that changes behaviour is
 * a rewrite; (2) `money.js` must exist and export `formatMoney`, used by all
 * three render functions instead of three copies of the same formula.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { renderLine, renderTotal, renderRefund } from "./src/invoice.js";

const problems = [];
const check = (label, actual, expected) => {
  if (actual !== expected) problems.push(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

check("renderLine unchanged", renderLine({ name: "Widget", amount: 12.5 }), "Widget  $12.50");
check("renderTotal unchanged", renderTotal([{ amount: 12.5 }, { amount: 0.255 }]), "TOTAL  $12.76");
check("renderRefund unchanged", renderRefund(3), "REFUND  -$3.00");
check("half-up rounding unchanged (small)", renderLine({ name: "x", amount: 0.005 }), "x  $0.01");
check("half-up rounding unchanged (large)", renderLine({ name: "x", amount: 1.005 }), "x  $1.00");

let money;
try {
  money = await import("./src/money.js");
} catch (error) {
  problems.push(`src/money.js does not exist or does not load: ${error.message}`);
}

if (money) {
  if (typeof money.formatMoney !== "function") {
    problems.push("src/money.js does not export a function named formatMoney");
  } else {
    check("formatMoney(12.5)", money.formatMoney(12.5), "$12.50");
    check("formatMoney(0.255)", money.formatMoney(0.255), "$0.26");
    check("formatMoney(0)", money.formatMoney(0), "$0.00");
  }
}

if (problems.length > 0) {
  console.error("build failed: extraction incomplete or behaviour changed");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

await mkdir(new URL("./dist/", import.meta.url), { recursive: true });
await writeFile(
  new URL("./dist/invoice.txt", import.meta.url),
  [renderLine({ name: "Widget", amount: 12.5 }), renderTotal([{ amount: 12.5 }])].join("\n"),
);
console.log("build ok: invoice unchanged, formatMoney extracted");
