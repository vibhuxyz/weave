/**
 * Build: compute a stats report over a fixed sample, including the two
 * functions (`median`, `percentile`) this feature adds.
 *
 * Expected values below are computed by hand from the sorted sample, not by
 * calling a second implementation — so there is nothing for a buggy
 * implementation to agree with.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { mean, min, max, median, percentile } from "./src/stats.js";

const problems = [];
const check = (label, actual, expected) => {
  if (actual !== expected) problems.push(`${label}: got ${actual}, expected ${expected}`);
};

check("mean unchanged", mean([1, 2, 3, 4]), 2.5);
check("min unchanged", min([3, 1, 2]), 1);
check("max unchanged", max([3, 1, 2]), 3);

check("median of odd-length set", median([3, 1, 2]), 2);
check("median of a singleton", median([5]), 5);
check("median of even-length set is the mean of the middle two", median([1, 2, 3, 4]), 2.5);
check("median does not depend on input order", median([9, 1, 5, 3]), 4);
check("median of empty input is 0", median([]), 0);

const sample = [1, 2, 3, 4, 5];
check("percentile 0 is the minimum", percentile(sample, 0), 1);
check("percentile 100 is the maximum", percentile(sample, 100), 5);
check("percentile 50 is the median", percentile(sample, 50), 3);
check("percentile 25 interpolates linearly", percentile(sample, 25), 2);
check("percentile of empty input is 0", percentile([], 50), 0);

if (problems.length > 0) {
  console.error("build failed: stats report does not match the expected values");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

await mkdir(new URL("./dist/", import.meta.url), { recursive: true });
await writeFile(
  new URL("./dist/report.json", import.meta.url),
  JSON.stringify({ median: median(sample), p25: percentile(sample, 25) }, null, 2),
);
console.log("build ok: stats report reconciled");
