import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCompactTokenCount,
  formatDuration,
  formatExactTokenCount,
  nextSweepPosition,
  resultBarRuns,
  sweepBarRuns,
} from "./format.ts";

test("tooltip shows exact grouped counts", () => {
  assert.equal(`${formatExactTokenCount(60_915)} / ${formatExactTokenCount(128_000)} tokens`, "60,915 / 128,000 tokens");
});

test("popover shows compact counts, whole above 10K", () => {
  assert.equal(`${formatCompactTokenCount(60_915)} / ${formatCompactTokenCount(128_000)}`, "61K / 128K");
  assert.equal(formatCompactTokenCount(9_540), "9.5K");
  assert.equal(formatCompactTokenCount(717), "717");
});

test("durations read as seconds, then minutes and padded seconds", () => {
  assert.equal(formatDuration(0), "0s");
  assert.equal(formatDuration(38_400), "38s");
  assert.equal(formatDuration(65_000), "1m 05s");
  assert.equal(formatDuration(-5), "0s");
});

function render(runs: readonly { text: string }[]): string {
  return runs.map((part) => part.text).join("");
}

test("sweep bar keeps a fixed width and clamps the segment inside it", () => {
  assert.equal(render(sweepBarRuns(0)), `${"━".repeat(9)}${"░".repeat(23)}`);
  assert.equal(render(sweepBarRuns(5)).length, 32);
  assert.equal(render(sweepBarRuns(99)), `${"░".repeat(23)}${"━".repeat(9)}`);
});

test("result bar shows now as solid and the freed part as faded", () => {
  const runs = resultBarRuns(80, 25);
  assert.deepEqual(runs.map((part) => [part.tone, part.text.length]), [["solid", 8], ["faded", 18], ["empty", 6]]);
  assert.equal(render(resultBarRuns(100, 0)).length, 32);
});

test("sweep position bounces between the ends", () => {
  assert.deepEqual(nextSweepPosition(22, 1), { position: 23, direction: 1 });
  assert.deepEqual(nextSweepPosition(23, 1), { position: 22, direction: -1 });
  assert.deepEqual(nextSweepPosition(0, -1), { position: 1, direction: 1 });
});
