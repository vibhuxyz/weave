import test from "node:test";
import assert from "node:assert/strict";
import type { WeaveEvent } from "@weave/protocol";
import { MAX_CRITIQUE_ISSUES, MAX_PLAN_WARNINGS, MAX_TASK_SKILLS } from "./constants.ts";
import { projectRunEvent } from "./project-event.ts";

const BASE = { runId: "r1", seq: 1, at: "2026-09-25T00:00:00.000Z" } as const;
const CLASSIFICATION = { taskType: "feature", scope: "cross-module", risk: "high", domains: ["backend", "payments"] } as const;

function reviewed(fields: Partial<Extract<WeaveEvent, { type: "plan.reviewed" }>>): WeaveEvent {
  return { ...BASE, type: "plan.reviewed", attempts: 1, classification: null, warnings: [], critique: null, ...fields };
}

test("a reviewed plan carries its classification and warnings to the run panel", () => {
  const update = projectRunEvent(reviewed({ classification: { ...CLASSIFICATION, domains: [...CLASSIFICATION.domains] }, warnings: ["T1 asks for skills not in the catalog: x"] }));
  assert.deepEqual(update, { kind: "plan-review", classification: CLASSIFICATION, critique: null, warnings: ["T1 asks for skills not in the catalog: x"], hiddenWarningCount: 0 });
});

test("the AI review verdict reaches the run panel with its issues capped", () => {
  const issues = Array.from({ length: MAX_CRITIQUE_ISSUES + 2 }, (_, index) => ({ type: "missing_dependency", taskIds: ["T2"], reason: `reason ${index}` }));
  const update = projectRunEvent(reviewed({ critique: { outcome: "revised", issues } }));
  assert.ok(update?.kind === "plan-review");
  assert.equal(update.critique?.outcome, "revised");
  assert.equal(update.critique?.issues.length, MAX_CRITIQUE_ISSUES);
});

test("plan warnings are capped with a count of the rest", () => {
  const warnings = Array.from({ length: MAX_PLAN_WARNINGS + 3 }, (_, index) => `warning ${index}`);
  const update = projectRunEvent(reviewed({ warnings }));
  assert.ok(update?.kind === "plan-review");
  assert.equal(update.warnings.length, MAX_PLAN_WARNINGS);
  assert.equal(update.hiddenWarningCount, 3);
});

test("planned tasks keep their skills, capped, and their complexity", () => {
  const skills = Array.from({ length: MAX_TASK_SKILLS + 2 }, (_, index) => `skill-${index}`);
  const event: WeaveEvent = {
    ...BASE, type: "plan.created", kind: "existing", mode: "sequential", reason: "single-task", concurrency: 1,
    goal: "ship the api", assumptions: [], risks: [],
    tasks: [{ id: "T1", title: "API", allowedPaths: ["apps/api/**"], dependsOn: [], produces: ["OrdersApi"], skills, complexity: "medium" }, { id: "T2", title: "UI", allowedPaths: [], dependsOn: [] }],
  };
  const update = projectRunEvent(event);
  assert.ok(update?.kind === "plan");
  assert.equal(update.tasks[0]?.skills?.length, MAX_TASK_SKILLS);
  assert.equal(update.tasks[0]?.complexity, "medium");
  assert.deepEqual(update.tasks[0]?.produces, ["OrdersApi"]);
  assert.equal(update.goal, "ship the api");
  assert.deepEqual(update.tasks[1], { id: "T2", title: "UI", dependsOn: [], allowedPaths: [] });
});

test("the execution plan reaches the run panel with its slots", () => {
  const slot = { taskId: "T1", worker: 1, employeeId: "backend-engineer", engineId: "codex", fallbackEngineIds: ["claude-code"], after: [], startMs: 0, endMs: 600_000 };
  const event: WeaveEvent = { ...BASE, type: "plan.execution", workers: 1, timing: "estimated", estimatedMs: 600_000, estimatedCostMicroUsd: "250000", slots: [slot] };
  assert.deepEqual(projectRunEvent(event), {
    kind: "execution-plan",
    plan: { workers: 1, timing: "estimated", estimatedMs: 600_000, estimatedCostMicroUsd: "250000", slots: [slot] },
  });
});

test("the run panel learns which engines plan and review, but not for the fast path", () => {
  const triaged = (route: "fast" | "plan"): WeaveEvent => ({ ...BASE, type: "plan.triaged", route, reason: "r", plannerEngineId: "claude-code", reviewerEngineId: "codex" });
  assert.deepEqual(projectRunEvent(triaged("plan")), { kind: "planning", planner: "Claude Code", reviewer: "Codex" });
  assert.equal(projectRunEvent(triaged("fast")), null);
});
