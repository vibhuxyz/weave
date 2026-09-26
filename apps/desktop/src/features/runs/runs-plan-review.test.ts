import test from "node:test";
import assert from "node:assert/strict";
import type { RunUpdate } from "../../../server/index.ts";
import { durationMinutes, engineText, slotStartText } from "./lib";
import { applyRunMessages } from "./store/apply-run-message";
import type { RunMessage } from "./types";

const started: RunMessage = { type: "run-started", runKey: "k1", request: "add payouts" };
const update = (value: RunUpdate): RunMessage => ({ type: "run-update", runKey: "k1", update: value });

test("the plan review is kept on the run, and lanes carry skills and complexity", () => {
  const classification = { taskType: "feature", scope: "cross-module", risk: "high", domains: ["backend"] } as const;
  const run = applyRunMessages(null, [
    started,
    update({ kind: "plan-review", classification, critique: { outcome: "approved", issues: [] }, warnings: ["No task names a verification step"], hiddenWarningCount: 0 }),
    update({ kind: "plan", goal: null, assumptions: [], risks: [], mode: "sequential", reason: "single-task", tasks: [{ id: "T1", title: "API", dependsOn: [], allowedPaths: [], skills: ["postgres"], complexity: "high" }, { id: "T2", title: "UI", dependsOn: [], allowedPaths: [] }] }),
  ]);
  assert.deepEqual(run?.review, { classification, critique: { outcome: "approved", issues: [] }, warnings: ["No task names a verification step"], hiddenWarningCount: 0 });
  assert.deepEqual(run?.lanes.T1?.skills, ["postgres"]);
  assert.equal(run?.lanes.T1?.complexity, "high");
  assert.deepEqual(run?.lanes.T2?.skills, []);
  assert.equal(run?.lanes.T2?.complexity, null);
});

test("a new run starts without a plan review", () => {
  assert.equal(applyRunMessages(null, [started])?.review, null);
});

test("the execution plan is kept on the run, and slots read as a schedule", () => {
  const slot = { taskId: "T2", worker: 2, employeeId: null, engineId: "codex", fallbackEngineIds: ["claude-code"], after: ["T1"], startMs: 60_000, endMs: 180_000 };
  const plan = { workers: 2, timing: "estimated", estimatedMs: 180_000, estimatedCostMicroUsd: null, slots: [slot] } as const;
  const run = applyRunMessages(null, [started, update({ kind: "execution-plan", plan })]);
  assert.deepEqual(run?.execution, plan);
  assert.equal(slotStartText(slot), "after T1");
  assert.equal(slotStartText({ startMs: 0, after: [] }), "starts now");
  assert.equal(slotStartText({ startMs: 5, after: [] }), "when a worker frees up");
  assert.equal(engineText(slot), "codex (then claude-code)");
  assert.equal(durationMinutes(slot.endMs - slot.startMs), 2);
  assert.equal(durationMinutes(10), 1);
});
