import test from "node:test";
import assert from "node:assert/strict";
import { latestPlanEntries, planChangeEntries, planChanges } from "./plan-changes";
import type { ChatTurn, PlanItem } from "./types";

const item = (content: string, status: PlanItem["status"]): PlanItem => ({ id: content, content, status });

test("a plan update becomes added, started and completed task entries", () => {
  const first = planChanges([], [item("Scan", "in_progress"), item("Parse", "pending"), item("Graph", "pending")]);
  assert.deepEqual(first.map((change) => `${change.kind} ${change.content}`), ["added Scan", "added Parse", "added Graph"]);
  const next = planChanges([item("Scan", "in_progress"), item("Parse", "pending")], [item("Scan", "completed"), item("Parse", "in_progress"), item("Docs", "completed")]);
  assert.deepEqual(next.map((change) => `${change.kind} ${change.content}`), ["completed Scan", "started Parse", "added Docs", "completed Docs"]);
  assert.deepEqual(planChanges([item("Scan", "pending")], [item("Scan", "pending")]), []);
});

test("entries get stable ids and are marked as plan changes", () => {
  const entries = planChangeEntries("turn-1", 4, [{ kind: "added", content: "Scan" }], 10);
  assert.deepEqual(entries[0], { id: "plan:turn-1:4", title: "Scan", status: "completed", kind: "other", planChange: "added", startedAt: 10, endedAt: 10 });
});

test("the latest plan is the most recent turn that has one", () => {
  const turn = (id: string, entries: PlanItem[] | null): ChatTurn => ({ id, role: "assistant", text: "", thought: "", tools: [], ...(entries ? { plan: { entries } } : {}) });
  assert.deepEqual(latestPlanEntries([turn("a", [item("Old", "pending")]), turn("b", [item("New", "pending")]), turn("c", null)]).map((entry) => entry.content), ["New"]);
});
