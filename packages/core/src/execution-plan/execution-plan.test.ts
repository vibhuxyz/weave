import test from "node:test";
import assert from "node:assert/strict";
import { buildExecutionPlan } from "./build-execution-plan.ts";
import { executionPlanEvent } from "./execution-event.ts";
import type { ExecutionPlanInput } from "./types.ts";

const MINUTE = 60_000;
const after = (...ids: string[]) => ({ dependencies: ids.map((task) => ({ task })) });

function input(overrides: Partial<ExecutionPlanInput> = {}): ExecutionPlanInput {
  return {
    tasks: [{ id: "T1" }, { id: "T2" }, { id: "T3" }, { id: "T4", ...after("T1", "T2", "T3") }],
    workers: 3,
    employeesByTask: new Map([["T1", "database-engineer"], ["T2", "backend-engineer"]]),
    enginesByTask: new Map([["T2", ["codex", "claude-code"]]]),
    defaultEngines: ["claude-code", "gemini"],
    estimatedMsByTask: new Map([["T1", 4 * MINUTE], ["T2", 10 * MINUTE], ["T3", 6 * MINUTE], ["T4", 3 * MINUTE]]),
    estimatedCostMicroUsd: 420_000n,
    ...overrides,
  };
}

test("independent tasks start together on separate workers, and integration waits for them", () => {
  const plan = buildExecutionPlan(input());
  const byTask = new Map(plan.slots.map((slot) => [slot.taskId, slot]));
  assert.deepEqual(["T1", "T2", "T3"].map((id) => byTask.get(id)?.startMs), [0, 0, 0]);
  assert.equal(new Set(["T1", "T2", "T3"].map((id) => byTask.get(id)?.worker)).size, 3);
  assert.equal(byTask.get("T4")?.startMs, 10 * MINUTE);
  assert.deepEqual(byTask.get("T4")?.after, ["T1", "T2", "T3"]);
  assert.equal(plan.estimatedMs, 13 * MINUTE);
});

test("each slot names its employee, engine and fallbacks", () => {
  const byTask = new Map(buildExecutionPlan(input()).slots.map((slot) => [slot.taskId, slot]));
  assert.deepEqual([byTask.get("T2")?.employeeId, byTask.get("T2")?.engineId, byTask.get("T2")?.fallbackEngineIds], ["backend-engineer", "codex", ["claude-code"]]);
  assert.deepEqual([byTask.get("T3")?.employeeId, byTask.get("T3")?.engineId], [null, "claude-code"]);
});

test("with fewer workers a ready task queues until a worker frees up", () => {
  const plan = buildExecutionPlan(input({ workers: 2 }));
  const queued = plan.slots.find((slot) => slot.startMs > 0 && slot.after.length === 0);
  assert.ok(queued);
  assert.ok(plan.slots.every((slot) => slot.worker >= 1 && slot.worker <= 2));
});

test("without estimates the plan keeps the order but reports no time", () => {
  const plan = buildExecutionPlan(input({ estimatedMsByTask: null, estimatedCostMicroUsd: null }));
  assert.equal(plan.timing, "order-only");
  assert.equal(plan.estimatedMs, null);
  assert.equal(plan.slots.at(-1)?.taskId, "T4");
});

test("the ledger event carries the cost as a string", () => {
  assert.equal(executionPlanEvent(buildExecutionPlan(input())).estimatedCostMicroUsd, "420000");
});
