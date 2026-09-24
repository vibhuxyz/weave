import test from "node:test";
import assert from "node:assert/strict";
import type { WeaveEvent } from "@weave/protocol";
import { foldTaskState, upgradeTaskState } from "./index.ts";

const RUN_ID = "run-1";
const TASK_ID = "T1";
const GOAL = "Build a Todo API";

function base(seq: number, at = "2026-09-13T00:00:00.000Z") {
  return { runId: RUN_ID, seq, at, taskId: TASK_ID };
}

const EVENTS: WeaveEvent[] = [
  { ...base(1), type: "task.started", cwd: "/proj", prompt: GOAL },
  {
    ...base(2),
    type: "agent.message",
    update: {
      sessionUpdate: "plan",
      entries: [
        { content: "Scaffold server", status: "completed" },
        { content: "Implement POST /todos", status: "in_progress" },
        { content: "Add tests", status: "pending" },
      ],
    },
  },
  {
    ...base(3),
    type: "agent.message",
    update: {
      sessionUpdate: "tool_call",
      toolCallId: "tc-1",
      title: "Edit server.ts",
      kind: "edit",
      status: "in_progress",
      locations: [{ path: "apps/api/src/server.ts" }],
    },
  },
  {
    ...base(4),
    type: "agent.message",
    update: { sessionUpdate: "tool_call_update", toolCallId: "tc-1", status: "completed" },
  },
  { ...base(5), type: "file.written", path: "apps/api/src/server.ts", bytes: 512 },
  {
    ...base(6),
    type: "verification.rung",
    rung: "typecheck",
    strength: 3,
    command: "tsc --noEmit",
    ok: true,
    wallMs: 1200,
  },
  { ...base(7), type: "error", message: "permission denied on first attempt", where: "tool_call:tc-2" },
  {
    ...base(8),
    type: "agent.message",
    update: {
      sessionUpdate: "tool_call",
      toolCallId: "tc-2",
      title: "Edit todos.ts",
      kind: "edit",
      status: "in_progress",
      locations: [{ path: "apps/api/src/todos.ts" }],
    },
  },
];

test("foldTaskState reconstructs plan progress, files, verification, and the in-flight edit", () => {
  const state = foldTaskState(EVENTS, GOAL, TASK_ID);

  assert.equal(state.taskId, TASK_ID);
  assert.equal(state.goal, GOAL);
  assert.equal(state.atSeq, 8);

  assert.deepEqual(state.completed, ["Scaffold server"]);
  assert.equal(state.currentStep, "Implement POST /todos");
  assert.equal(state.nextStep, "Add tests");
  assert.equal(state.status, "running");
  assert.deepEqual(state.remaining, ["Add tests"]);

  assert.deepEqual(state.changedFiles.modified, ["apps/api/src/server.ts", "apps/api/src/todos.ts"]);
  assert.deepEqual(state.filesRead, []);

  assert.equal(state.verification.length, 1);
  assert.deepEqual(state.verification[0], { rung: "typecheck", status: "passed", wallMs: 1200 });
  assert.equal(state.commands.length, 1);
  assert.equal(state.commands[0]?.command, "tsc --noEmit");

  assert.equal(state.failures.length, 1);
  assert.deepEqual(state.failures[0], { kind: "error", message: "permission denied on first attempt", where: "tool_call:tc-2", atSeq: 7 });
  assert.equal(state.engineState.turns, 2);

  assert.equal(state.inFlight.length, 1);
  assert.equal(state.inFlight[0]?.toolCallId, "tc-2");
  assert.deepEqual(state.inFlight[0]?.locations, ["apps/api/src/todos.ts"]);

  assert.deepEqual(state.decisions, []);
  assert.deepEqual(state.gitState, { branch: null, baseCommit: null, headCommit: null, dirty: [] });
});

test("foldTaskState is pure: same events in, same state out", () => {
  const a = foldTaskState(EVENTS, GOAL, TASK_ID);
  const b = foldTaskState(EVENTS, GOAL, TASK_ID);
  assert.deepEqual(a, b);
});

test("foldTaskState drops a tool_call_update whose tool_call was never seen", () => {
  const events: WeaveEvent[] = [
    { ...base(1), type: "task.started", cwd: "/proj", prompt: "x" },
    {
      ...base(2),
      type: "agent.message",
      update: { sessionUpdate: "tool_call_update", toolCallId: "ghost", status: "completed" },
    },
  ];
  const state = foldTaskState(events, "x", TASK_ID);
  assert.deepEqual(state.inFlight, []);
});

test("worker notes, failed checks, engine usage and the finish reach the task state", () => {
  const notes = "Done with the route.\n```json\n{ \"taskNotes\": { \"decisions\": [\"Store todos in memory\"], \"discoveries\": [\"server.ts owns routing\"], \"openQuestions\": [\"Should todos persist?\"] } }\n```";
  const events: WeaveEvent[] = [
    { ...base(1), type: "task.started", cwd: "/proj", prompt: GOAL },
    { ...base(2), type: "attempt.started", taskId: TASK_ID, attemptIndex: 0, engineId: "claude-code", sessionId: "s-1" },
    { ...base(3), type: "agent.message", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: notes.slice(0, 40) } } },
    { ...base(4), type: "agent.message", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: notes.slice(40) } } },
    { ...base(5), type: "agent.message", update: { sessionUpdate: "tool_call", toolCallId: "s", title: "grep todos", kind: "search", status: "completed" } },
    { ...base(6), type: "usage", used: 1200, size: 200000, costUsd: 0.04 },
    { ...base(7), type: "verification.rung", rung: "tests", strength: 4, command: "npm test", ok: false, wallMs: 90 },
    { ...base(8), type: "task.finished", status: "failed", stopReason: "max_turns", wallMs: 10 },
  ];
  const state = foldTaskState(events, GOAL, TASK_ID, { contextVersion: 3, dependencies: [{ task: "T0", requiredOutputs: ["Todo"] }] });
  assert.equal(state.status, "failed");
  assert.deepEqual(state.decisions.map((decision) => decision.description), ["Store todos in memory"]);
  assert.deepEqual(state.discoveries.map((discovery) => [discovery.source, discovery.text]), [["worker", "server.ts owns routing"], ["tool", "Searched: grep todos"]]);
  assert.deepEqual(state.openQuestions.map((question) => question.text), ["Should todos persist?"]);
  assert.deepEqual(state.failures.map((failure) => failure.kind), ["verification", "engine"]);
  assert.deepEqual(state.engineState, { engineId: "claude-code", sessionId: "s-1", attempts: 1, turns: 1, lastStopReason: "max_turns", contextUsed: 1200, contextSize: 200000, costUsd: 0.04 });
  assert.equal(state.contextVersion, 3);
  assert.deepEqual(state.dependencies, [{ task: "T0", requiredOutputs: ["Todo"] }]);
});

test("a version 1 checkpoint state is upgraded, not thrown away", () => {
  const upgraded = upgradeTaskState({
    schemaVersion: 1, taskId: TASK_ID, goal: GOAL, atSeq: 4, completed: ["a"], inProgress: { description: "b" }, remaining: ["c"],
    files: { read: ["r.ts"], modified: ["m.ts"], created: [], deleted: [] }, commands: [], verification: [], decisions: [],
    errors: [{ message: "boom", where: "x", atSeq: 2 }], inFlight: [], git: { branch: "main", baseCommit: null, headCommit: null, dirty: [] },
  });
  assert.equal(upgraded.schemaVersion, 2);
  assert.equal(upgraded.currentStep, "b");
  assert.equal(upgraded.nextStep, "c");
  assert.deepEqual(upgraded.changedFiles.modified, ["m.ts"]);
  assert.deepEqual(upgraded.failures, [{ kind: "error", message: "boom", where: "x", atSeq: 2 }]);
  assert.equal(upgraded.gitState.branch, "main");
});
