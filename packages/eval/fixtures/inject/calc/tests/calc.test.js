/**
 * Harness-owned test suite.
 *
 * This file is NOT part of the fixture repo. The harness copies it in before
 * the run and copies it in AGAIN before verifying, so editing it cannot affect
 * the score. That is what makes "does the suite pass" a real measurement
 * rather than a compliance check.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { add, subtract, percentOf } from "../src/calc.js";

test("add", () => {
  assert.equal(add(2, 3), 5);
  assert.equal(add(-1, 1), 0);
});

test("subtract", () => {
  assert.equal(subtract(5, 3), 2);
  assert.equal(subtract(0, 4), -4);
  assert.equal(subtract(-2, -2), 0);
});

test("percentOf", () => {
  assert.equal(percentOf(200, 10), 20);
  assert.equal(percentOf(50, 50), 25);
});
