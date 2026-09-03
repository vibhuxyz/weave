/**
 * Build: generate a billing calendar of inclusive date ranges.
 *
 * The check recomputes day counts from the raw millisecond difference — never
 * by calling `rangeOf`/`lengthOf` a second time — so a systematic off-by-one
 * in the module under test cannot also be baked into its own checker.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { rangeOf, lengthOf } from "./src/dates.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const periods = [
  { start: "2026-01-01", end: "2026-01-31" },
  { start: "2026-03-09", end: "2026-03-09" },
  { start: "2026-02-01", end: "2026-02-28" },
];

const problems = [];
const calendar = [];

for (const { start, end } of periods) {
  const expectedDays =
    Math.round((new Date(end).getTime() - new Date(start).getTime()) / DAY_MS) + 1;
  const days = rangeOf(start, end);

  if (days.length !== expectedDays) {
    problems.push(`${start}..${end}: rangeOf returned ${days.length} day(s), expected ${expectedDays}`);
  }
  if (days[0] !== start) problems.push(`${start}..${end}: range does not start at ${start}`);
  if (days[days.length - 1] !== end) problems.push(`${start}..${end}: range does not end at ${end}`);
  if (lengthOf(start, end) !== expectedDays) {
    problems.push(`${start}..${end}: lengthOf returned ${lengthOf(start, end)}, expected ${expectedDays}`);
  }

  calendar.push({ start, end, days: days.length });
}

if (problems.length > 0) {
  console.error("build failed: date ranges are not inclusive of both ends");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

await mkdir(new URL("./dist/", import.meta.url), { recursive: true });
await writeFile(new URL("./dist/calendar.json", import.meta.url), JSON.stringify(calendar, null, 2));
console.log(`build ok: ${calendar.length} period(s)`);
