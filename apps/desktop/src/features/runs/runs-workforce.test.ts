import test from "node:test";
import assert from "node:assert/strict";
import type { RunUpdate } from "../../../server/index.ts";
import { MAX_LANE_NOTES, MAX_RUN_ALERTS } from "./constants";
import { usdFromMicro } from "./lib";
import { applyRunMessages } from "./store/apply-run-message";
import type { RunMessage } from "./types";

const started: RunMessage = { type: "run-started", runKey: "k1", request: "split the api" };
const update = (value: RunUpdate): RunMessage => ({ type: "run-update", runKey: "k1", update: value });
const plan = update({ kind: "plan", mode: "parallel", reason: "disjoint-paths", tasks: [{ id: "T1", title: "api", dependsOn: [] }, { id: "T2", title: "ui", dependsOn: [] }] });

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
