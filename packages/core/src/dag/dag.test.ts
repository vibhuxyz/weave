import test from "node:test";
import assert from "node:assert/strict";
import type { WorkerStatus } from "@weave/protocol";
import { nextStep, type ScheduledState } from "../scheduler/index.ts";
import { outputKey, taskPhases } from "./phases.ts";
import type { DagTask, TaskPhase } from "./types.ts";
import { validateDag } from "./validate.ts";
import { canTransitionWorker, isTerminalWorkerStatus, transitionWorker } from "./worker-state.ts";

function task(id: string, options: Partial<DagTask> = {}): DagTask {
  return { id, ...options };
}

function whole(...ids: readonly string[]) {
  return ids.map((id) => ({ task: id, requiredOutputs: [] }));
}

function phasesOf(
  tasks: readonly DagTask[],
  states: Readonly<Record<string, ScheduledState>>,
  readyOutputs: readonly string[] = [],
  verifying: readonly string[] = [],
): Record<string, TaskPhase> {
  const views = taskPhases({
    tasks,
    states: new Map(Object.entries(states)),
    readyOutputs: new Set(readyOutputs),
    verifying: new Set(verifying),
  });
  return Object.fromEntries(views.map((view) => [view.taskId, view.phase]));
}

const FAN_OUT: readonly DagTask[] = [
  task("T1", { produces: ["survey"] }),
  task("T3", { dependencies: whole("T1") }),
  task("T4", { dependencies: whole("T1") }),
];

test("T1 starts while T3 and T4 wait on the whole of it", () => {
  assert.deepEqual(validateDag(FAN_OUT), { ok: true });

  const start = nextStep(FAN_OUT, new Map());
  assert.deepEqual(start.ready, ["T1"]);

  assert.deepEqual(phasesOf(FAN_OUT, {}), { T1: "ready", T3: "pending", T4: "pending" });

  const running = new Map<string, ScheduledState>([["T1", "running"]]);
  assert.deepEqual(nextStep(FAN_OUT, running).ready, []);
  assert.deepEqual(phasesOf(FAN_OUT, { T1: "running" }), {
    T1: "running",
    T3: "pending",
    T4: "pending",
  });

  const done = new Map<string, ScheduledState>([["T1", "ok"]]);
  assert.deepEqual(nextStep(FAN_OUT, done).ready, ["T3", "T4"]);
  assert.deepEqual(phasesOf(FAN_OUT, { T1: "ok" }), { T1: "completed", T3: "ready", T4: "ready" });
});

const ARTIFACT_DAG: readonly DagTask[] = [
  task("T1", { produces: ["A"] }),
  task("T2", { dependencies: [{ task: "T1", requiredOutputs: ["A"] }] }),
];

test("a task that needs an artifact starts beside its producer and continues when the artifact is ready", () => {
  assert.deepEqual(validateDag(ARTIFACT_DAG), { ok: true });

  const start = nextStep(ARTIFACT_DAG, new Map());
  assert.deepEqual(start.ready, ["T1", "T2"], "T2 must be able to start its unrelated work");

  const both = { T1: "running", T2: "running" } as const;
  const waiting = taskPhases({
    tasks: ARTIFACT_DAG,
    states: new Map(Object.entries(both)),
    readyOutputs: new Set(),
  });
  assert.deepEqual(waiting.map((view) => view.phase), ["running", "partially-blocked"]);
  assert.deepEqual(waiting[1]?.waitingFor, [outputKey("T1", "A")]);

  const continued = phasesOf(ARTIFACT_DAG, both, [outputKey("T1", "A")]);
  assert.deepEqual(continued, { T1: "running", T2: "running" });

  const verifying = phasesOf(ARTIFACT_DAG, both, [outputKey("T1", "A")], ["T2"]);
  assert.equal(verifying["T2"], "verifying");
});

test("a task whose dependency failed is reported as failed, naming what blocked it", () => {
  const views = taskPhases({
    tasks: FAN_OUT,
    states: new Map<string, ScheduledState>([["T1", "failed"]]),
    readyOutputs: new Set(),
  });
  assert.deepEqual(views.map((view) => view.phase), ["failed", "failed", "failed"]);
  assert.deepEqual(views[1]?.blockedBy, ["T1"]);
});

test("a cycle between two artifact dependencies is rejected before execution", () => {
  const cyclic: readonly DagTask[] = [
    task("T1", { produces: ["A"], dependencies: [{ task: "T2", requiredOutputs: ["B"] }] }),
    task("T2", { produces: ["B"], dependencies: [{ task: "T1", requiredOutputs: ["A"] }] }),
  ];
  const result = validateDag(cyclic);
  assert.ok(!result.ok);
  assert.deepEqual(result.issues.map((issue) => issue.kind), ["cycle"]);
  assert.match(result.issues[0]?.message ?? "", /T1 -> T2 -> T1|T2 -> T1 -> T2/);
});

test("unknown tasks, self dependencies, duplicates and undeclared outputs are all rejected", () => {
  const unknown = validateDag([task("T1", { dependencies: whole("TX") })]);
  assert.ok(!unknown.ok);
  assert.deepEqual(unknown.issues.map((issue) => issue.kind), ["unknown-dependency"]);

  const self = validateDag([task("T1", { dependencies: whole("T1") })]);
  assert.ok(!self.ok);
  assert.deepEqual(self.issues.map((issue) => issue.kind), ["self-dependency"]);

  const duplicate = validateDag([task("T1"), task("T1")]);
  assert.ok(!duplicate.ok);
  assert.deepEqual(duplicate.issues.map((issue) => issue.kind), ["duplicate-task"]);

  const undeclared = validateDag([
    task("T1", { produces: ["A"] }),
    task("T2", { dependencies: [{ task: "T1", requiredOutputs: ["B"] }] }),
  ]);
  assert.ok(!undeclared.ok);
  assert.deepEqual(undeclared.issues.map((issue) => issue.kind), ["undeclared-output"]);
  assert.match(undeclared.issues[0]?.message ?? "", /T2 waits for B from T1/);
});

test("the worker state machine allows the real path and refuses the impossible ones", () => {
  const path: readonly WorkerStatus[] = [
    "created",
    "starting",
    "running",
    "waiting-for-artifact",
    "running",
    "waiting-for-approval",
    "running",
    "verifying",
    "completed",
  ];
  path.forEach((from, index) => {
    const to = path[index + 1];
    if (to) assert.ok(canTransitionWorker(from, to), `${from} -> ${to} should be allowed`);
  });

  assert.ok(isTerminalWorkerStatus("completed"));
  assert.ok(isTerminalWorkerStatus("failed"));
  assert.ok(isTerminalWorkerStatus("cancelled"));
  assert.ok(!isTerminalWorkerStatus("blocked"));

  const backwards = transitionWorker("completed", "running");
  assert.ok(!backwards.ok);
  assert.match(backwards.reason, /completed is a final state/);

  const skipped = transitionWorker("created", "verifying");
  assert.ok(!skipped.ok);
  assert.match(skipped.reason, /allowed: starting, cancelled/);

  const forward = transitionWorker("running", "blocked");
  assert.ok(forward.ok);
  assert.equal(forward.status, "blocked");
});

test("phases are the same on every run", () => {
  const once = () => phasesOf(ARTIFACT_DAG, { T1: "running", T2: "running" });
  assert.deepEqual(once(), once());
});
