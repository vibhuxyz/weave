import test from "node:test";
import assert from "node:assert/strict";
import { nextStep, topologicalOrder } from "./scheduler.ts";
import type { ScheduledState, SchedulableTask } from "./types.ts";

const after = (task: string) => ({ task, requiredOutputs: [] });

const GRAPH: readonly SchedulableTask[] = [
  { id: "T1" },
  { id: "T2" },
  { id: "T3", dependencies: [after("T1")] },
  { id: "T4", dependencies: [after("T2"), after("T3")] },
];

test("independent tasks are ready together, in plan order", () => {
  assert.deepEqual(nextStep(GRAPH, new Map()), { ready: ["T1", "T2"], skipped: [], isFinished: false });
});

test("a task waits until every dependency finished ok", () => {
  const states = new Map<string, ScheduledState>([["T1", "ok"], ["T2", "running"]]);
  assert.deepEqual(nextStep(GRAPH, states).ready, ["T3"]);
});

test("a failed dependency skips its dependents with a reason, and the run can finish", () => {
  const states = new Map<string, ScheduledState>([["T1", "failed"], ["T2", "ok"]]);
  const step = nextStep(GRAPH, states);
  assert.deepEqual(step.skipped, [{ taskId: "T3", reason: "dependency T1 ended as failed" }]);
  assert.deepEqual(step.ready, []);
  const next = nextStep(GRAPH, new Map([...states, ["T3", "skipped"]]));
  assert.deepEqual(next.skipped, [{ taskId: "T4", reason: "dependency T3 ended as skipped" }]);
  assert.equal(nextStep(GRAPH, new Map([...states, ["T3", "skipped"], ["T4", "skipped"]])).isFinished, true);
});

test("running tasks keep the run open", () => {
  const states = new Map<string, ScheduledState>([["T1", "ok"], ["T2", "ok"], ["T3", "ok"], ["T4", "running"]]);
  assert.deepEqual(nextStep(GRAPH, states), { ready: [], skipped: [], isFinished: false });
});

test("topological order respects dependencies and is stable", () => {
  assert.deepEqual(topologicalOrder(GRAPH), ["T1", "T2", "T3", "T4"]);
  assert.deepEqual(topologicalOrder([{ id: "B", dependencies: [after("A")] }, { id: "A" }]), ["A", "B"]);
});

test("a task starts early once a running producer published every required output", () => {
  const tasks: readonly SchedulableTask[] = [
    { id: "DB" },
    { id: "API", dependencies: [{ task: "DB", requiredOutputs: ["schema"] }] },
    { id: "UI", dependencies: [after("DB")] },
  ];
  const states = new Map<string, ScheduledState>([["DB", "running"]]);
  assert.deepEqual(nextStep(tasks, states).ready, []);
  const published = new Map([["DB", new Set(["schema"])]]);
  assert.deepEqual(nextStep(tasks, states, published).ready, ["API"]);
  assert.deepEqual(nextStep(tasks, new Map([["DB", "failed"]]), published).skipped.map((entry) => entry.taskId), ["API", "UI"]);
});
