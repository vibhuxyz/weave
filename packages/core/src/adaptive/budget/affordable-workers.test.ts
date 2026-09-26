import test from "node:test";
import assert from "node:assert/strict";
import { affordableWorkers } from "./affordable-workers.ts";
import { NO_SPEND } from "./types.ts";

const USD = 1_000_000n;

test("without a per-task ceiling or a cost limit, the budget says nothing about worker count", () => {
  assert.equal(affordableWorkers({}, NO_SPEND), null);
  assert.equal(affordableWorkers({ run: { maxCostMicroUsd: 10n * USD } }, NO_SPEND), null);
  assert.equal(affordableWorkers({ task: { maxCostMicroUsd: USD } }, NO_SPEND), null);
});

test("the run limit divided by the per-task ceiling is what the run can afford at once", () => {
  assert.equal(affordableWorkers({ run: { maxCostMicroUsd: 10n * USD }, task: { maxCostMicroUsd: 3n * USD } }, NO_SPEND), 3);
});

test("the project limit counts what the project already spent", () => {
  const budgets = { project: { maxCostMicroUsd: 10n * USD }, task: { maxCostMicroUsd: 2n * USD } };
  assert.equal(affordableWorkers(budgets, { ...NO_SPEND, costMicroUsd: 6n * USD }), 2);
  assert.equal(affordableWorkers(budgets, { ...NO_SPEND, costMicroUsd: 10n * USD }), 1);
});

test("the tightest of the run and project limits wins", () => {
  const budgets = { run: { maxCostMicroUsd: 8n * USD }, project: { maxCostMicroUsd: 4n * USD }, task: { maxCostMicroUsd: USD } };
  assert.equal(affordableWorkers(budgets, NO_SPEND), 4);
});
