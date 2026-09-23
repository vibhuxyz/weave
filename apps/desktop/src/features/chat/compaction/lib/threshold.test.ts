import test from "node:test";
import assert from "node:assert/strict";
import {
  clampThresholdPercent,
  parseAutoCompactThreshold,
  percentToThreshold,
  thresholdToPercent,
} from "./threshold.ts";

test("parses stored thresholds and falls back to the default", () => {
  assert.equal(parseAutoCompactThreshold(null), 0.8);
  assert.equal(parseAutoCompactThreshold("abc"), 0.8);
  assert.equal(parseAutoCompactThreshold("0.7"), 0.7);
  assert.equal(parseAutoCompactThreshold("1"), 1);
  assert.equal(parseAutoCompactThreshold("0"), 1);
});

test("converts between threshold and slider percent", () => {
  assert.equal(thresholdToPercent(0.75), 75);
  assert.equal(thresholdToPercent(1), 100);
  assert.equal(percentToThreshold(250), 1);
  assert.equal(clampThresholdPercent(Number.NaN), 80);
  assert.equal(clampThresholdPercent(0), 1);
});
