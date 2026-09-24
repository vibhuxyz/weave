import test from "node:test";
import assert from "node:assert/strict";
import type { planAndRun } from "@weave/core";
import type { WeaveEvent } from "@weave/protocol";
import type { ServerMessage } from "../shared/index.ts";
import { projectRunEvent } from "./project-event.ts";
import { createRunController } from "./run-controller.ts";
import { DEFAULT_RUN_OPTIONS, parseRunOptions } from "./run-options.ts";

const BASE = { runId: "r1", seq: 1, at: "2026-09-24T00:00:00.000Z" } as const;
const eventOf = (fields: object): WeaveEvent => ({ ...BASE, ...fields }) as WeaveEvent;

test("lane updates come from task-scoped events, keyed by taskId", () => {
  const chunk = eventOf({ type: "agent.message", taskId: "API", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } } });
  const tool = eventOf({ type: "agent.message", taskId: "API", update: { sessionUpdate: "tool_call", title: "Edit\n  api/index.js" } });
  assert.deepEqual(projectRunEvent(chunk), { kind: "text", taskId: "API", text: "hi" });
  assert.deepEqual(projectRunEvent(tool), { kind: "tool", taskId: "API", title: "Edit api/index.js" });
  assert.deepEqual(projectRunEvent(eventOf({ type: "usage", taskId: "API", used: 1, size: 2, costUsd: 0.25 })), { kind: "cost", taskId: "API", costUsd: 0.25 });
  assert.equal(projectRunEvent(eventOf({ type: "usage", taskId: "API", used: 1, size: 2 })), null);
  assert.equal(projectRunEvent(eventOf({ type: "file.read", taskId: "API", path: "a" })), null);
  assert.equal(projectRunEvent(eventOf({ type: "agent.message", taskId: "API", update: "garbage" })), null);
});

test("the plan update names each task and its dependencies", () => {
  const plan = eventOf({ type: "plan.created", kind: "existing", mode: "parallel", reason: "disjoint-paths", concurrency: 2, tasks: [{ id: "T1", title: "add", allowedPaths: ["a.js"], dependsOn: [] }, { id: "T2", title: "sub", allowedPaths: ["b.js"], dependsOn: ["T1"] }] });
  assert.deepEqual(projectRunEvent(plan), {
    kind: "plan",
    mode: "parallel",
    reason: "disjoint-paths",
    tasks: [{ id: "T1", title: "add", dependsOn: [] }, { id: "T2", title: "sub", dependsOn: ["T1"] }],
  });
});

function fakePlanAndRun(events: readonly WeaveEvent[]): typeof planAndRun {
  return async (options) => {
    for (const event of events) options.onEvent?.(event);
    if (options.signal?.aborted) return { status: "refused", reason: "cancelled" };
    return { status: "no-change-needed", reason: "already there" };
  };
}

test("a run streams its updates between run-started and run-finished", async () => {
  const sent: ServerMessage[] = [];
  const runs = createRunController(fakePlanAndRun([eventOf({ type: "task.started", taskId: "T1", cwd: "/w", prompt: "p" })]));
  await runs.start({ request: "  add helpers ", projectDir: "/repo", weaveHome: "/home/u/.weave", engineId: "claude", runKey: "k1", send: (message) => sent.push(message) });
  assert.deepEqual(sent, [
    { type: "run-started", runKey: "k1", request: "add helpers", options: DEFAULT_RUN_OPTIONS },
    { type: "run-update", runKey: "k1", update: { kind: "task-started", taskId: "T1" } },
    { type: "run-finished", runKey: "k1", outcome: { status: "no-change-needed", reason: "already there" } },
  ]);
});

test("a second run while one is active is refused, and an empty request never starts", async () => {
  const sent: ServerMessage[] = [];
  const send = (message: ServerMessage) => sent.push(message);
  const release: { open: () => void } = { open: () => undefined };
  const gate = new Promise<void>((resolve) => {
    release.open = resolve;
  });
  const runs = createRunController(async () => {
    await gate;
    return { status: "refused", reason: "dirty" };
  });
  const first = runs.start({ request: "one", projectDir: "/repo", weaveHome: "/home/u/.weave", engineId: "claude", runKey: "k1", send });
  await runs.start({ request: "two", projectDir: "/repo", weaveHome: "/home/u/.weave", engineId: "claude", runKey: "k2", send });
  await runs.start({ request: "   ", projectDir: "/repo", weaveHome: "/home/u/.weave", engineId: "claude", runKey: "k3", send });
  release.open();
  await first;
  assert.deepEqual(sent.map((message) => message.type), ["run-started", "error", "error", "run-finished"]);
});

test("a planner that throws still ends the run with its reason", async () => {
  const sent: ServerMessage[] = [];
  const runs = createRunController(async () => {
    throw new Error("engine missing");
  });
  await runs.start({ request: "go", projectDir: "/repo", weaveHome: "/home/u/.weave", engineId: "claude", runKey: "k1", send: (message) => sent.push(message) });
  assert.deepEqual(sent.at(-1), { type: "run-finished", runKey: "k1", outcome: { status: "error", reason: "Parallel run failed: engine missing" } });
});

test("employee, verification, coordination, decision and budget events reach the run view", () => {
  assert.deepEqual(projectRunEvent(eventOf({ type: "employee.assigned", taskId: "T1", employeeId: "backend-engineer", score: 7, reasons: ["backend-engineer: responsible for API\ndevelopment"] })),
    { kind: "employee", taskId: "T1", employeeId: "backend-engineer", reason: "backend-engineer: responsible for API development" });
  assert.deepEqual(projectRunEvent(eventOf({ type: "employee.verified", taskId: "T1", employeeId: "qa-engineer", ok: false, rungs: [], detail: "tests failed" })),
    { kind: "verification", taskId: "T1", employeeId: "qa-engineer", ok: false, detail: "tests failed" });
  const artifact = { id: "e1", version: 1, seq: 1, occurredAt: "t", correlationId: "e1", from: "DB", type: "artifact.ready", data: { artifact: { name: "schema", version: 2, summary: "orders", files: [] } } };
  assert.deepEqual(projectRunEvent(eventOf({ type: "coordination.event", taskId: "DB", event: artifact, recipients: ["API"] })),
    { kind: "coordination", taskId: "DB", event: "artifact.ready", summary: "schema v2: orders", recipients: ["API"] });
  const decided = projectRunEvent(eventOf({ type: "orchestration.decided", workers: 2, reason: "2 workers", benefitMs: { timeSaved: 1, coordination: 0, mergeRisk: 0, verification: 0, startup: 0, total: 1 }, estimatedCostMicroUsd: "500", tasks: [{ taskId: "T1", kind: "api", sizeUnits: 1, engines: ["codex"], estimatedMs: 10 }] }));
  assert.equal(decided?.kind === "decision" && decided.routes[0]?.engines[0], "codex");
  assert.deepEqual(projectRunEvent(eventOf({ type: "budget.exceeded", taskId: "T1", scope: "task", key: "T1", dimension: "cost", limit: "$1.000000", spent: "$2.000000", action: "stop-task" })),
    { kind: "budget", taskId: "T1", scope: "task", key: "T1", dimension: "cost", limit: "$1.000000", spent: "$2.000000", action: "stop-task" });
});

test("run options are parsed strictly; budgets need adaptive mode and valid amounts", () => {
  assert.deepEqual(parseRunOptions(undefined), { ok: true, options: DEFAULT_RUN_OPTIONS, budgets: undefined });
  const withBudget = parseRunOptions({ adaptive: true, employees: true, budgets: { runMaxCostUsd: "2.50", runMaxMinutes: 30 } });
  assert.ok(withBudget.ok);
  assert.deepEqual(withBudget.ok ? withBudget.budgets : null, { run: { maxCostMicroUsd: 2_500_000n, maxWallMs: 1_800_000 } });
  const bad = parseRunOptions({ adaptive: true, budgets: { runMaxCostUsd: "lots" } });
  assert.match(bad.ok ? "" : bad.reason, /maxCostUsd must be a decimal string/);
  const noAdaptive = parseRunOptions({ adaptive: false, budgets: { taskMaxCostUsd: "1" } });
  assert.match(noAdaptive.ok ? "" : noAdaptive.reason, /turn it on/);
});
