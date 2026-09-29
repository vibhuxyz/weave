import test from "node:test";
import assert from "node:assert/strict";
import type { RunUpdate } from "../../../server/index.ts";
import { MAX_LANE_AWAITED, MAX_LANE_NOTES, MAX_RUN_ALERTS, MAX_RUN_ARTIFACTS, MAX_RUN_REPLANS } from "./constants";
import { usdFromMicro, workerCountText, workforceText } from "./lib";
import { applyRunMessages } from "./store/apply-run-message";
import { selectWorkforce } from "./store/select-header";
import type { RunMessage } from "./types";

const started: RunMessage = { type: "run-started", runKey: "k1", request: "split the api" };
const update = (value: RunUpdate): RunMessage => ({ type: "run-update", runKey: "k1", update: value });
const plan = update({ kind: "plan", goal: null, assumptions: [], risks: [], mode: "parallel", reason: "disjoint-paths", tasks: [{ id: "T1", title: "api", dependsOn: [], allowedPaths: [] }, { id: "T2", title: "ui", dependsOn: [], allowedPaths: [] }] });

test("a lane records its employee, claims, verification and a block that clears when it starts", () => {
  const run = applyRunMessages(null, [
    started,
    plan,
    update({ kind: "employee-assigned", taskId: "T1", employeeId: "backend-engineer", reasons: ["responsibility: api"] }),
    update({ kind: "blocked", taskId: "T1", reason: "Waiting for T2" }),
  ]);
  assert.equal(run?.lanes["T1"]?.blockedReason, "Waiting for T2");
  const later = applyRunMessages(run, [
    update({ kind: "task-started", taskId: "T1" }),
    update({ kind: "claimed", taskId: "T1", resources: ["file:api/index.ts"] }),
    update({ kind: "employee-verified", taskId: "T1", ok: false, rungs: [{ rung: "tests", ok: false }], detail: "1 failing" }),
  ]);
  const lane = later?.lanes["T1"];
  assert.equal(lane?.blockedReason, null);
  assert.deepEqual(lane?.employee, { employeeId: "backend-engineer", reasons: ["responsibility: api"] });
  assert.deepEqual(lane?.claims, ["file:api/index.ts"]);
  assert.equal(lane?.verification?.ok, false);
});

test("a dependency found mid-run adds an edge once, and notes keep only the latest few", () => {
  const notes = Array.from({ length: MAX_LANE_NOTES + 2 }, (_, index) => update({ kind: "note", taskId: "T2", tone: "info", text: `n${index}` }));
  const run = applyRunMessages(null, [
    started,
    plan,
    update({ kind: "dependency-added", taskId: "T2", on: "T1", reason: "needs the contract" }),
    update({ kind: "dependency-added", taskId: "T2", on: "T1", reason: "again" }),
    ...notes,
  ]);
  const lane = run?.lanes["T2"];
  assert.deepEqual(lane?.dependsOn, ["T1"]);
  assert.equal(lane?.notes.length, MAX_LANE_NOTES);
  assert.equal(lane?.notes.at(-1)?.text, `n${MAX_LANE_NOTES + 1}`);
  assert.equal(lane?.noteCount, MAX_LANE_NOTES + 4);
});

test("the run keeps the orchestration decision and caps budget alerts", () => {
  const alert = { scope: "task", key: "T1", dimension: "cost", limit: "1000000", spent: "1200000", action: "stop-task" } as const;
  const run = applyRunMessages(null, [
    started,
    update({ kind: "orchestration", workers: 3, reason: "critical path", estimatedCostMicroUsd: "250000", timeSavedMs: 40_000 }),
    ...Array.from({ length: MAX_RUN_ALERTS + 3 }, () => update({ kind: "budget-exceeded", alert })),
  ]);
  assert.equal(run?.orchestration?.workers, 3);
  assert.equal(run?.budgetAlerts.length, MAX_RUN_ALERTS);
  assert.equal(run?.hiddenAlertCount, 3);
});

test("micro-dollar strings convert to dollars and anything else is refused", () => {
  assert.equal(usdFromMicro("250000"), 0.25);
  assert.equal(usdFromMicro("-5"), null);
  assert.equal(usdFromMicro("1e9"), null);
});

const staffed = update({
  kind: "plan", goal: null, assumptions: [], risks: [], mode: "parallel", reason: "disjoint-paths",
  tasks: [
    { id: "DB", title: "db", dependsOn: [], allowedPaths: ["db/**"], subtasks: ["Design the Todo schema", "Publish the schema", "Write the migration"] },
    { id: "API", title: "api", dependsOn: [], allowedPaths: ["api/**"], subtasks: ["Sketch the routes", "Use the schema"] },
  ],
});

test("milestones count up as the worker reports them, and an unlisted one becomes a note", () => {
  const run = applyRunMessages(null, [
    started,
    staffed,
    update({ kind: "subtask", taskId: "DB", subtask: "Design the Todo schema", index: 0 }),
    update({ kind: "subtask", taskId: "DB", subtask: "design the todo schema", index: 0 }),
    update({ kind: "subtask", taskId: "DB", subtask: "Tidy up the seed data", index: null }),
  ]);
  const lane = run?.lanes["DB"];
  assert.deepEqual(lane?.subtasksDone, ["Design the Todo schema"]);
  assert.equal(lane?.subtasks.length, 3);
  assert.deepEqual(lane?.notes.map((note) => note.text), ["Finished Tidy up the seed data, which was not one of its milestones"]);
  assert.deepEqual(run?.lanes["API"]?.subtasksDone, []);
});

test("a request shows as asked until the output arrives, then as received", () => {
  const asked = applyRunMessages(null, [
    started,
    staffed,
    update({ kind: "awaiting", taskId: "API", output: "schema", producer: null, reason: "need the Todo columns" }),
  ]);
  assert.deepEqual(asked?.lanes["API"]?.awaited, [{ output: "schema", producer: null, hasArrived: false }]);
  assert.equal(asked?.lanes["API"]?.status, "waiting");

  const arrived = applyRunMessages(asked, [update({ kind: "awaited-arrived", taskId: "API", output: "schema", producer: "DB" })]);
  assert.deepEqual(arrived?.lanes["API"]?.awaited, [{ output: "schema", producer: "DB", hasArrived: true }]);

  const many = applyRunMessages(arrived, Array.from({ length: MAX_LANE_AWAITED + 2 }, (_, index) =>
    update({ kind: "awaiting", taskId: "API", output: `extra${index}`, producer: "DB", reason: "r" })));
  assert.equal(many?.lanes["API"]?.awaited.length, MAX_LANE_AWAITED);
});

test("published outputs are listed once each, with who received them", () => {
  const published = applyRunMessages(null, [
    started,
    staffed,
    update({ kind: "artifact", taskId: "DB", artifact: { name: "schema", version: 1, summary: "todos table", kind: "artifact", isUpdate: false } }),
    update({ kind: "artifact", taskId: "DB", artifact: { name: "schema", version: 2, summary: "todos table, fixed", kind: "artifact", isUpdate: true } }),
    update({ kind: "awaited-arrived", taskId: "API", output: "schema", producer: "DB" }),
    update({ kind: "awaited-arrived", taskId: "API", output: "schema", producer: "DB" }),
  ]);
  assert.deepEqual(published?.artifacts.map((entry) => [entry.key, entry.artifact.version, entry.deliveredTo]), [["DB/schema", 2, ["API"]]]);
  assert.deepEqual(published?.lanes["DB"]?.notes.map((note) => note.text), ["Published artifact schema v1", "Published artifact schema v2"]);

  const overflowing = applyRunMessages(published, Array.from({ length: MAX_RUN_ARTIFACTS + 2 }, (_, index) =>
    update({ kind: "artifact", taskId: "DB", artifact: { name: `extra${index}`, version: 1, summary: "s", kind: "artifact", isUpdate: false } })));
  assert.equal(overflowing?.artifacts.length, MAX_RUN_ARTIFACTS);
  assert.equal(overflowing?.hiddenArtifactCount, 3);
});

test("an arrival for an output nobody published leaves the artifact list alone", () => {
  const run = applyRunMessages(null, [started, staffed, update({ kind: "awaited-arrived", taskId: "API", output: "ghost", producer: "DB" })]);
  assert.deepEqual(run?.artifacts, []);
  assert.deepEqual(run?.lanes["API"]?.awaited, [{ output: "ghost", producer: "DB", hasArrived: true }]);
});

test("a replan shows what woke the coordinator, then what it decided", () => {
  const asked = applyRunMessages(null, [
    started,
    staffed,
    update({ kind: "replan-requested", round: 1, triggers: [{ kind: "worker-failed", taskId: "DB", detail: "crashed" }], hiddenTriggerCount: 0 }),
  ]);
  assert.deepEqual(asked?.replans.map((entry) => [entry.round, entry.action]), [[1, null]]);

  const decided = applyRunMessages(asked, [
    update({ kind: "replan-decided", round: 1, action: "rerun", reason: "engine crash", rerun: [{ id: "DB", engineId: "codex" }], warnings: [] }),
    update({ kind: "replan-decided", round: 9, action: "continue", reason: "for a round nobody asked about", rerun: [], warnings: [] }),
  ]);
  assert.deepEqual(decided?.replans.map((entry) => [entry.round, entry.action, entry.rerun]), [[1, "rerun", [{ id: "DB", engineId: "codex" }]]]);

  const repeated = applyRunMessages(decided, [update({ kind: "replan-requested", round: 1, triggers: [], hiddenTriggerCount: 0 })]);
  assert.equal(repeated?.replans.length, 1);
  assert.equal(repeated?.replans[0]?.action, "rerun");

  const many = applyRunMessages(decided, Array.from({ length: MAX_RUN_REPLANS + 2 }, (_, index) =>
    update({ kind: "replan-requested", round: index + 2, triggers: [], hiddenTriggerCount: 0 })));
  assert.equal(many?.replans.length, MAX_RUN_REPLANS);
});

test("the header counts workers that are actually running, not the capacity the plan asked for", () => {
  const count = { workers: 3, limitedBy: "plan", reason: "3 workers", requested: 3, maxWorkers: 4, machineCapacity: 8, affordable: null } as const;
  const fanOut = update({
    kind: "plan", goal: null, assumptions: [], risks: [], mode: "parallel", reason: "disjoint-paths",
    tasks: [
      { id: "T1", title: "contract", dependsOn: [], allowedPaths: ["packages/shared/**"], produces: ["Todo"] },
      { id: "T2", title: "web", dependsOn: ["T1"], allowedPaths: ["apps/web/**"] },
      { id: "T3", title: "tests", dependsOn: ["T1"], allowedPaths: ["apps/api/tests/**"] },
    ],
  });
  const planned = applyRunMessages(null, [started, fanOut, update({ kind: "worker-count", count })]);
  assert.equal(workerCountText(count), "up to 3 workers, set by the plan");
  assert.equal(
    workforceText(selectWorkforce({ run: planned })),
    "0 of 3 workers running, 2 waiting on other tasks",
    "T1 depends on nothing, so it is not waiting on another task",
  );

  const running = applyRunMessages(planned, [update({ kind: "task-started", taskId: "T1" })]);
  assert.equal(workforceText(selectWorkforce({ run: running })), "1 of 3 workers running, 2 waiting on other tasks");

  const fannedOut = applyRunMessages(running, [
    update({ kind: "task-settled", taskId: "T1", status: "ok", reason: null, wallMs: 1000, installMs: 0 }),
    update({ kind: "task-started", taskId: "T2" }),
    update({ kind: "task-started", taskId: "T3" }),
  ]);
  assert.equal(workforceText(selectWorkforce({ run: fannedOut })), "2 of 3 workers running");
  assert.equal(workforceText({ running: 0, waiting: 0, capacity: 3 }), null);
});

test("a worker that only needs an output is not shown as waiting for the whole task", () => {
  const plan = update({
    kind: "plan", goal: null, assumptions: [], risks: [], mode: "parallel", reason: "disjoint-paths",
    tasks: [
      { id: "T1", title: "api", dependsOn: [], allowedPaths: ["apps/api/**"], produces: ["todo-api-contract"] },
      { id: "T2", title: "web", dependsOn: ["T1"], allowedPaths: ["apps/web/**"] },
      { id: "T3", title: "docs", dependsOn: ["T1"], startsAfter: ["T1"], allowedPaths: ["docs/**"] },
    ],
  });
  const run = applyRunMessages(null, [started, plan]);
  assert.deepEqual(run?.lanes["T2"]?.startsAfter, []);
  assert.deepEqual(run?.lanes["T2"]?.dependsOn, ["T1"]);
  assert.deepEqual(run?.lanes["T3"]?.startsAfter, ["T1"]);
});
