import test from "node:test";
import assert from "node:assert/strict";
import type { WeaveEvent } from "@weave/protocol";
import { foldTaskState } from "./state.ts";

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
  assert.deepEqual(state.inProgress, { description: "Implement POST /todos" });
  assert.deepEqual(state.remaining, ["Add tests"]);

  assert.deepEqual(state.files.modified, ["apps/api/src/server.ts", "apps/api/src/todos.ts"]);
  assert.deepEqual(state.files.read, []);

  assert.equal(state.verification.length, 1);
  assert.deepEqual(state.verification[0], { rung: "typecheck", status: "passed", wallMs: 1200 });
  assert.equal(state.commands.length, 1);
  assert.equal(state.commands[0]?.command, "tsc --noEmit");

  assert.equal(state.errors.length, 1);
  assert.equal(state.errors[0]?.message, "permission denied on first attempt");

  assert.equal(state.inFlight.length, 1);
  assert.equal(state.inFlight[0]?.toolCallId, "tc-2");
  assert.deepEqual(state.inFlight[0]?.locations, ["apps/api/src/todos.ts"]);

  assert.deepEqual(state.decisions, []);
  assert.deepEqual(state.git, { branch: null, baseCommit: null, headCommit: null, dirty: [] });
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
