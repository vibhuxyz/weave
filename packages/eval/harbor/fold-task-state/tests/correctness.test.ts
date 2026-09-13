// Hidden grader — weight 0.6. Not visible to the agent while it works.
// Copied to /app/__grader__/ and run from there at verification time, so
// "../src/state.ts" resolves to the agent's own implementation.
import test from "node:test";
import assert from "node:assert/strict";
import type { WeaveEvent } from "../src/protocol/index.ts";
import { foldTaskState } from "../src/state.ts";

const RUN_ID = "run-1";
const TASK_ID = "T1";

function base(seq: number, at = "2026-09-13T00:00:00.000Z") {
  return { runId: RUN_ID, seq, at, taskId: TASK_ID };
}

// Exactly the worked example from instruction.md.
const EVENTS: WeaveEvent[] = [
  { ...base(1), type: "task.started", cwd: "/proj", prompt: "Build a Todo API" },
  {
    ...base(2),
    type: "agent.message",
    update: {
      sessionUpdate: "plan",
      entries: [
        { content: "Scaffold server", status: "completed" },
        { content: "Implement POST /todos", status: "in_progress" },
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

test("foldTaskState matches the worked example in instruction.md", () => {
  const state = foldTaskState(EVENTS, "Build a Todo API", TASK_ID);

  assert.equal(state.taskId, TASK_ID);
  assert.equal(state.goal, "Build a Todo API");
  assert.equal(state.atSeq, 8);

  assert.deepEqual(state.completed, ["Scaffold server"]);
  assert.deepEqual(state.inProgress, { description: "Implement POST /todos" });
  assert.deepEqual(state.remaining, []);

  assert.deepEqual(state.files.modified, ["apps/api/src/server.ts", "apps/api/src/todos.ts"]);
  assert.deepEqual(state.files.read, []);
  assert.deepEqual(state.files.created, []);
  assert.deepEqual(state.files.deleted, []);

  assert.equal(state.commands.length, 1);
  assert.equal(state.commands[0].command, "tsc --noEmit");
  assert.equal(state.commands[0].ok, true);

  assert.equal(state.verification.length, 1);
  assert.deepEqual(state.verification[0], { rung: "typecheck", status: "passed", wallMs: 1200 });

  assert.deepEqual(state.decisions, []);
  assert.equal(state.errors.length, 1);
  assert.equal(state.errors[0].message, "permission denied on first attempt");
  assert.equal(state.errors[0].where, "tool_call:tc-2");
  assert.equal(state.errors[0].atSeq, 7);

  assert.equal(state.inFlight.length, 1);
  assert.equal(state.inFlight[0].toolCallId, "tc-2");
  assert.deepEqual(state.inFlight[0].locations, ["apps/api/src/todos.ts"]);
  assert.equal(state.inFlight[0].startedAtSeq, 8);

  assert.deepEqual(state.git, { branch: null, baseCommit: null, headCommit: null, dirty: [] });
});

test("a plan update replaces state wholesale rather than accumulating", () => {
  const events: WeaveEvent[] = [
    { ...base(1), type: "task.started", cwd: "/proj", prompt: "x" },
    {
      ...base(2),
      type: "agent.message",
      update: { sessionUpdate: "plan", entries: [{ content: "Step A", status: "completed" }] },
    },
    {
      ...base(3),
      type: "agent.message",
      update: {
        sessionUpdate: "plan",
        entries: [
          { content: "Step A", status: "completed" },
          { content: "Step B", status: "completed" },
        ],
      },
    },
  ];
  const state = foldTaskState(events, "x", TASK_ID);
  // Not ["Step A", "Step A", "Step B"] — the second plan update replaces,
  // it does not append on top of the first.
  assert.deepEqual(state.completed, ["Step A", "Step B"]);
});
