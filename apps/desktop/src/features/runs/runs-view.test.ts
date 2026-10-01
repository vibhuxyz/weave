import test from "node:test";
import assert from "node:assert/strict";
import type { RunPlanTask, RunUpdate } from "../../../server/index.ts";
import { applyRunMessages } from "./store/apply-run-message";
import { lanePhase, laneProgress, runProgress } from "./store/lane-phase";
import { laneViewOf, runSummaryOf, selectEvents, selectFiles } from "./store/select-view";
import { durationText } from "./components/RunSummary";
import { MAX_RUN_FILES } from "./constants";
import type { RunState } from "./types";

const RUN_KEY = "run-1";

function plan(tasks: readonly RunPlanTask[]): RunUpdate {
  return { kind: "plan", mode: "parallel", reason: "disjoint", goal: null, assumptions: [], risks: [], tasks };
}

function task(id: string, extra: Partial<RunPlanTask> = {}): RunPlanTask {
  return { id, title: id, dependsOn: [], allowedPaths: [], ...extra };
}

function runWith(updates: readonly RunUpdate[]): RunState {
  const messages = [
    { type: "run-started", runKey: RUN_KEY, request: "build it" },
    ...updates.map((update) => ({ type: "run-update", runKey: RUN_KEY, update })),
  ] as never;
  const run = applyRunMessages(null, messages);
  assert.ok(run);
  return run;
}

test("a task moves through pending, ready, running and completed", () => {
  const tasks = [task("T1"), task("T2", { dependsOn: ["T1"], startsAfter: ["T1"] })];

  const planned = runWith([plan(tasks)]);
  assert.equal(lanePhase(planned.lanes["T1"]!, planned.lanes), "ready");
  assert.equal(lanePhase(planned.lanes["T2"]!, planned.lanes), "pending");

  const running = runWith([plan(tasks), { kind: "task-started", taskId: "T1" }]);
  assert.equal(lanePhase(running.lanes["T1"]!, running.lanes), "running");
  assert.equal(lanePhase(running.lanes["T2"]!, running.lanes), "pending");

  const done = runWith([
    plan(tasks),
    { kind: "task-started", taskId: "T1" },
    { kind: "task-settled", taskId: "T1", status: "ok", reason: null, wallMs: 1000, installMs: 0 },
  ]);
  assert.equal(lanePhase(done.lanes["T1"]!, done.lanes), "completed");
  assert.equal(lanePhase(done.lanes["T2"]!, done.lanes), "ready");
});

test("a running worker waiting on an artifact reads as partially blocked, not idle", () => {
  const tasks = [task("W1", { produces: ["todo-api-contract"] }), task("W3", { dependsOn: ["W1"] })];
  const waiting = runWith([
    plan(tasks),
    { kind: "task-started", taskId: "W1" },
    { kind: "task-started", taskId: "W3" },
    { kind: "awaiting", taskId: "W3", output: "todo-api-contract", producer: "W1", reason: "needs the contract" },
  ]);

  const view = laneViewOf(waiting.lanes, "W3");
  assert.ok(view);
  assert.equal(view.phase, "partially-blocked");
  assert.deepEqual(view.waitingFor, ["todo-api-contract"]);
  assert.equal(lanePhase(waiting.lanes["W1"]!, waiting.lanes), "running");

  const arrived = runWith([
    plan(tasks),
    { kind: "task-started", taskId: "W1" },
    { kind: "task-started", taskId: "W3" },
    { kind: "awaiting", taskId: "W3", output: "todo-api-contract", producer: "W1", reason: "needs the contract" },
    { kind: "awaited-arrived", taskId: "W3", output: "todo-api-contract", producer: "W1" },
  ]);
  assert.equal(laneViewOf(arrived.lanes, "W3")?.phase, "running");
});

test("a verifying worker is shown as verifying until it settles", () => {
  const tasks = [task("T1")];
  const verifying = runWith([
    plan(tasks),
    { kind: "task-started", taskId: "T1" },
    { kind: "verifying", taskId: "T1", rung: "tests" },
  ]);
  assert.equal(lanePhase(verifying.lanes["T1"]!, verifying.lanes), "verifying");

  const settled = runWith([
    plan(tasks),
    { kind: "task-started", taskId: "T1" },
    { kind: "verifying", taskId: "T1", rung: "tests" },
    { kind: "task-settled", taskId: "T1", status: "ok", reason: null, wallMs: 1000, installMs: 0 },
  ]);
  assert.equal(lanePhase(settled.lanes["T1"]!, settled.lanes), "completed");
});

test("a finished worker is verified only by real checks, and rejected when its work is refused", () => {
  const tasks = [task("T1"), task("T2"), task("T3"), task("T4")];
  const settle = (taskId: string, status: "ok" | "rejected") => ({ kind: "task-settled", taskId, status, reason: status === "ok" ? null : "wrote stray.ts", wallMs: 1, installMs: 0 }) as const;
  const run = runWith([
    plan(tasks),
    ...tasks.map((entry) => ({ kind: "task-started", taskId: entry.id }) as const),
    settle("T1", "ok"), settle("T2", "ok"), settle("T3", "ok"), settle("T4", "rejected"),
    { kind: "merge", taskId: "T1", status: "merged", checks: ["build", "tests"], detail: "merged and verified" },
    { kind: "merge", taskId: "T2", status: "merged", checks: [], detail: "merged; not verified" },
    { kind: "merge", taskId: "T3", status: "conflict", checks: [], detail: "conflict in api.ts" },
  ]);
  const phaseOf = (taskId: string) => {
    const lane = run.lanes[taskId];
    return lane ? lanePhase(lane, run.lanes) : null;
  };
  assert.deepEqual(tasks.map((entry) => phaseOf(entry.id)), ["verified", "completed", "rejected", "rejected"]);
  assert.equal(runSummaryOf(run, 0).completed, 2);
  assert.equal(runProgress(run.lanes, run.laneOrder), 100);
});

test("worker progress comes from finished subtasks, and the run rolls them up", () => {
  const tasks = [task("T1", { subtasks: ["design", "build", "test", "document"] }), task("T2")];
  const run = runWith([
    plan(tasks),
    { kind: "task-started", taskId: "T1" },
    { kind: "subtask", taskId: "T1", subtask: "design", index: 0 },
    { kind: "subtask", taskId: "T1", subtask: "build", index: 1 },
  ]);
  assert.equal(laneProgress(run.lanes["T1"]!), 50);
  assert.equal(laneProgress(run.lanes["T2"]!), null);
  assert.equal(runProgress(run.lanes, run.laneOrder), 25);
});

test("the run summary counts busy workers, finished tasks and duration", () => {
  const tasks = [task("T1"), task("T2"), task("T3")];
  const run = runWith([
    plan(tasks),
    { kind: "task-started", taskId: "T1" },
    { kind: "task-started", taskId: "T2" },
    { kind: "task-started", taskId: "T3" },
    { kind: "task-settled", taskId: "T3", status: "ok", reason: null, wallMs: 1000, installMs: 0 },
  ]);
  const summary = runSummaryOf({ ...run, startedAt: 1000, finishedAt: 91_000 }, 0);
  assert.equal(summary.workers, 2);
  assert.equal(summary.tasks, 3);
  assert.equal(summary.completed, 1);
  assert.equal(summary.isRunning, true);
  assert.equal(durationText(summary.durationMs), "1m 30s");
  assert.equal(durationText(45_000), "45s");
});

test("file changes are collected once per path with their kind and owning task", () => {
  const run = runWith([
    plan([task("T1"), task("T2")]),
    { kind: "file", taskId: "T1", path: "src/api/todos.ts", change: "created" },
    { kind: "file", taskId: "T1", path: "src/api/todos.ts", change: "modified" },
    { kind: "file", taskId: "T2", path: "src/components/TodoList.tsx", change: "created" },
    { kind: "file", taskId: "T2", path: "old/legacy.ts", change: "deleted" },
  ]);

  const { files } = selectFiles({ run });
  assert.deepEqual(files.map((file) => [file.path, file.change, file.taskId]), [
    ["src/api/todos.ts", "created", "T1"],
    ["src/components/TodoList.tsx", "created", "T2"],
    ["old/legacy.ts", "deleted", "T2"],
  ]);
  assert.equal(laneViewOf(run.lanes, "T1")?.changedFiles, 2);
  assert.equal(laneViewOf(run.lanes, "T2")?.changedFiles, 2);
});

test("the file list is capped and the overflow is counted, never silently dropped", () => {
  const writes: RunUpdate[] = Array.from({ length: MAX_RUN_FILES + 5 }, (_, index) => ({
    kind: "file",
    taskId: "T1",
    path: `src/file-${index}.ts`,
    change: "created",
  }));
  const run = runWith([plan([task("T1")]), ...writes]);
  const { files, hiddenFileCount } = selectFiles({ run });
  assert.equal(files.length, MAX_RUN_FILES);
  assert.equal(hiddenFileCount, 5);
});

test("the event feed records what happened and leaves out token noise", () => {
  const run = runWith([
    plan([task("T1")]),
    { kind: "text", taskId: "T1", text: "thinking out loud" },
    { kind: "cost", taskId: "T1", costUsd: 0.2 },
    { kind: "file", taskId: "T1", path: "src/api/todos.ts", change: "created" },
    { kind: "artifact", taskId: "T1", artifact: { name: "todo-api-contract", version: 1, summary: "s", kind: "artifact", isUpdate: false } },
  ]);

  const { events } = selectEvents({ run });
  assert.deepEqual(events.map((event) => event.kind), ["plan", "file", "artifact"]);
  assert.deepEqual(events.map((event) => event.text), [
    "plan",
    "created src/api/todos.ts",
    "todo-api-contract v1",
  ]);
});

test("a worker's current activity is shown and cleared when it settles", () => {
  const run = runWith([
    plan([task("T1")]),
    { kind: "task-started", taskId: "T1" },
    { kind: "activity", taskId: "T1", activity: "Implementing createTodo" },
  ]);
  assert.equal(laneViewOf(run.lanes, "T1")?.activity, "Implementing createTodo");

  const settled = runWith([
    plan([task("T1")]),
    { kind: "task-started", taskId: "T1" },
    { kind: "activity", taskId: "T1", activity: "Implementing createTodo" },
    { kind: "task-settled", taskId: "T1", status: "ok", reason: null, wallMs: 1000, installMs: 0 },
  ]);
  assert.equal(laneViewOf(settled.lanes, "T1")?.activity, null);
});

test("store selectors return a stable snapshot, so a render cannot loop", () => {
  const run = runWith([
    plan([task("T1"), task("T2", { dependsOn: ["T1"] })]),
    { kind: "task-started", taskId: "T1" },
    { kind: "file", taskId: "T1", path: "src/a.ts", change: "created" },
  ]);
  const state = { run };

  assert.equal(selectFiles(state).files, selectFiles(state).files);
  assert.equal(selectEvents(state).events, selectEvents(state).events);
  assert.equal(state.run.lanes, state.run.lanes);
  assert.equal(state.run.lanes["T1"], state.run.lanes["T1"]);
});

test("the lane view is derived from lanes, never selected as a fresh object", () => {
  const run = runWith([plan([task("T1")]), { kind: "task-started", taskId: "T1" }]);
  const first = laneViewOf(run.lanes, "T1");
  const second = laneViewOf(run.lanes, "T1");

  assert.deepEqual(first, second);
  assert.notEqual(first, second, "laneViewOf builds a new object, so it must be called during render, not inside a selector");
  assert.equal(laneViewOf(run.lanes, "missing"), null);
});
