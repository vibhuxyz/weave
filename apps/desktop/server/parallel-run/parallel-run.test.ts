import test from "node:test";
import assert from "node:assert/strict";
import type { planAndRun } from "@weave/core";
import type { WeaveEvent } from "@weave/protocol";
import type { ServerMessage } from "../shared/index.ts";
import { projectRunEvent } from "./project-event.ts";
import { createApprovalGate } from "./approval-gate.ts";
import { createRunController } from "./run-controller.ts";
import type { RunDependencies } from "./run-preflight.ts";

const READY: RunDependencies = { prepareRepo: async () => ({ ok: true }), readBudgets: async () => ({ ok: true, budgets: {} }) };

const BASE = { runId: "r1", seq: 1, at: "2026-09-24T00:00:00.000Z" } as const;
const eventOf = (fields: object): WeaveEvent => ({ ...BASE, ...fields }) as WeaveEvent;

test("lane updates come from task-scoped events, keyed by taskId", () => {
  const chunk = eventOf({ type: "agent.message", taskId: "API", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } } });
  const thought = eventOf({ type: "agent.message", taskId: "planner", update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "thinking..." } } });
  const tool = eventOf({ type: "agent.message", taskId: "API", update: { sessionUpdate: "tool_call", toolCallId: "c1", title: "Edit\n  api/index.js", kind: "edit", status: "in_progress" } });
  const toolDone = eventOf({ type: "agent.message", taskId: "API", update: { sessionUpdate: "tool_call_update", toolCallId: "c1", status: "completed" } });
  const namelessTool = eventOf({ type: "agent.message", taskId: "API", update: { sessionUpdate: "tool_call", title: "Edit api/index.js" } });
  assert.deepEqual(projectRunEvent(chunk), { kind: "text", taskId: "API", text: "hi" });
  assert.deepEqual(projectRunEvent(thought), { kind: "thought", taskId: "planner", text: "thinking..." });
  assert.deepEqual(projectRunEvent(tool), { kind: "tool", taskId: "API", tool: { id: "c1", title: "Edit api/index.js", toolKind: "edit", status: "in_progress" } });
  assert.deepEqual(projectRunEvent(toolDone), { kind: "tool-update", taskId: "API", tool: { id: "c1", status: "completed" } });
  assert.equal(projectRunEvent(namelessTool), null);
  assert.deepEqual(projectRunEvent(eventOf({ type: "usage", taskId: "API", used: 1, size: 2, costUsd: 0.25 })), { kind: "cost", taskId: "API", costUsd: 0.25 });
  assert.equal(projectRunEvent(eventOf({ type: "usage", taskId: "API", used: 1, size: 2 })), null);
  assert.equal(projectRunEvent(eventOf({ type: "file.read", taskId: "API", path: "a" })), null);
  assert.equal(projectRunEvent(eventOf({ type: "agent.message", taskId: "API", update: "garbage" })), null);
});

test("the plan update names each task and its dependencies", () => {
  const plan = eventOf({ type: "plan.created", goal: null, assumptions: [], risks: [], kind: "existing", mode: "parallel", reason: "disjoint-paths", concurrency: 2, tasks: [{ id: "T1", title: "add", allowedPaths: ["a.js"], dependsOn: [] }, { id: "T2", title: "sub", allowedPaths: ["b.js"], dependsOn: ["T1"] }] });
  assert.deepEqual(projectRunEvent(plan), {
    kind: "plan",
    mode: "parallel",
    reason: "disjoint-paths",
    goal: null,
    assumptions: [],
    risks: [],
    tasks: [{ id: "T1", title: "add", dependsOn: [], allowedPaths: ["a.js"] }, { id: "T2", title: "sub", dependsOn: ["T1"], allowedPaths: ["b.js"] }],
  });
});

test("the plan update carries who works on each task, on which engine, and what it must pass", () => {
  const plan = eventOf({
    type: "plan.created", goal: "a todo app", assumptions: [], risks: [], kind: "existing", mode: "parallel", reason: "disjoint-paths", concurrency: 2,
    tasks: [
      { id: "API", title: "api", allowedPaths: ["api/**"], dependsOn: ["DB"], readOnlyPaths: ["contracts/**"], produces: ["api-contract"], subtasks: ["publish the contract", "implement the routes"], skills: ["postgres"], complexity: "medium", employee: "backend-engineer", engine: "codex", verifyRung: "typecheck" },
    ],
  });
  const update = projectRunEvent(plan);
  assert.deepEqual(update?.kind === "plan" ? update.tasks : null, [{
    id: "API", title: "api", dependsOn: ["DB"], allowedPaths: ["api/**"], readOnlyPaths: ["contracts/**"],
    produces: ["api-contract"], subtasks: ["publish the contract", "implement the routes"], skills: ["postgres"], complexity: "medium", employeeId: "backend-engineer", engineId: "codex", verifyRung: "typecheck",
  }]);
});

test("the worker count update explains which constraint set it", () => {
  const event = eventOf({ type: "plan.workers", workers: 2, limitedBy: "machine", reason: "2 workers: this machine can run 2 at a time", requested: 5, maxWorkers: 4, machineCapacity: 2, affordable: null });
  assert.deepEqual(projectRunEvent(event), {
    kind: "worker-count",
    count: { workers: 2, limitedBy: "machine", reason: "2 workers: this machine can run 2 at a time", requested: 5, maxWorkers: 4, machineCapacity: 2, affordable: null },
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
  const runs = createRunController(fakePlanAndRun([eventOf({ type: "task.started", taskId: "T1", cwd: "/w", prompt: "p" })]), READY);
  await runs.start({ request: "  add helpers ", projectDir: "/repo", engineId: "claude", runKey: "k1", send: (message) => sent.push(message) });
  assert.deepEqual(sent, [
    { type: "run-started", runKey: "k1", request: "add helpers" },
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
  }, READY);
  const first = runs.start({ request: "one", projectDir: "/repo", engineId: "claude", runKey: "k1", send });
  await runs.start({ request: "two", projectDir: "/repo", engineId: "claude", runKey: "k2", send });
  await runs.start({ request: "   ", projectDir: "/repo", engineId: "claude", runKey: "k3", send });
  release.open();
  await first;
  assert.deepEqual(sent.map((message) => message.type), ["run-started", "error", "error", "run-finished"]);
});

test("a planner that throws still ends the run with its reason", async () => {
  const sent: ServerMessage[] = [];
  const runs = createRunController(async () => {
    throw new Error("engine missing");
  }, READY);
  await runs.start({ request: "go", projectDir: "/repo", engineId: "claude", runKey: "k1", send: (message) => sent.push(message) });
  assert.deepEqual(sent.at(-1), { type: "run-finished", runKey: "k1", outcome: { status: "error", reason: "Parallel run failed: engine missing" } });
});

test("a folder without a usable git repository ends the run asking to set one up, and the flag is passed through", async () => {
  const sent: ServerMessage[] = [];
  const asked: boolean[] = [];
  const runs = createRunController(async () => ({ status: "no-change-needed", reason: "unused" }), {
    ...READY,
    prepareRepo: async (_projectDir, options) => {
      asked.push(options.shouldSetUp);
      return options.shouldSetUp ? { ok: true } : { ok: false, needsSetup: true, reason: "no repo" };
    },
  });
  await runs.start({ request: "go", projectDir: "/repo", engineId: "claude", runKey: "k1", send: (message) => sent.push(message) });
  await runs.start({ request: "go", projectDir: "/repo", engineId: "claude", runKey: "k2", setUpGit: true, send: (message) => sent.push(message) });
  assert.deepEqual(asked, [false, true]);
  assert.deepEqual(sent[1], { type: "run-finished", runKey: "k1", outcome: { status: "needs-git", reason: "no repo" } });
  assert.deepEqual(sent.at(-1), { type: "run-finished", runKey: "k2", outcome: { status: "no-change-needed", reason: "unused" } });
});

const askingPlanAndRun: typeof planAndRun = async (options) => {
  const approved = await options.approvePlan?.();
  return approved ? { status: "no-change-needed", reason: "ran" } : { status: "refused", reason: "not approved" };
};

function updatesOf(sent: readonly ServerMessage[]): readonly string[] {
  return sent.flatMap((message) => (message.type === "run-update" ? [message.update.kind] : message.type === "run-finished" ? [`finished:${message.outcome.status}`] : []));
}

async function untilWaiting(sent: readonly ServerMessage[]): Promise<void> {
  while (!updatesOf(sent).includes("awaiting-approval")) await new Promise((resolve) => setImmediate(resolve));
}

test("a run waits for approval, and Start lets it continue", async () => {
  const sent: ServerMessage[] = [];
  const runs = createRunController(askingPlanAndRun, READY);
  const running = runs.start({ request: "go", projectDir: "/repo", engineId: "claude", runKey: "k1", send: (message) => sent.push(message) });
  await untilWaiting(sent);
  runs.decide("other-run", true);
  assert.deepEqual(updatesOf(sent), ["awaiting-approval"]);
  runs.decide("k1", true);
  await running;
  assert.deepEqual(updatesOf(sent), ["awaiting-approval", "plan-approved", "finished:no-change-needed"]);
});

test("declining or cancelling while waiting ends the run without starting it", async () => {
  for (const stop of ["decline", "cancel"] as const) {
    const sent: ServerMessage[] = [];
    const runs = createRunController(askingPlanAndRun, READY);
    const running = runs.start({ request: "go", projectDir: "/repo", engineId: "claude", runKey: "k1", send: (message) => sent.push(message) });
    await untilWaiting(sent);
    if (stop === "decline") runs.decide("k1", false);
    else runs.cancel();
    await running;
    assert.deepEqual(updatesOf(sent), ["awaiting-approval", "finished:refused"], stop);
  }
});

test("a gate answers once, and an already-aborted run is never asked", async () => {
  const aborted = new AbortController();
  aborted.abort();
  const calls: string[] = [];
  const gate = createApprovalGate(aborted.signal, { onWaiting: () => calls.push("waiting"), onApproved: () => calls.push("approved") });
  assert.equal(await gate.wait(), false);
  assert.equal(gate.decide(true), false);
  assert.deepEqual(calls, []);
});
