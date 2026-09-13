// Hidden grader — weight 0.2.
import test from "node:test";
import assert from "node:assert/strict";
import type { WeaveEvent } from "../src/protocol/index.ts";
import { foldTaskState } from "../src/state.ts";

const TASK_ID = "T1";
function base(seq: number) {
  return { runId: "run-1", seq, at: "2026-09-13T00:00:00.000Z", taskId: TASK_ID };
}

test("a tool_call_update whose tool_call was never seen is dropped, not thrown", () => {
  const events: WeaveEvent[] = [
    { ...base(1), type: "task.started", cwd: "/proj", prompt: "x" },
    {
      ...base(2),
      type: "agent.message",
      update: { sessionUpdate: "tool_call_update", toolCallId: "ghost", status: "completed" },
    },
  ];
  assert.doesNotThrow(() => {
    const state = foldTaskState(events, "x", TASK_ID);
    assert.deepEqual(state.inFlight, []);
  });
});

test("an event type outside the mapped set is ignored, not thrown", () => {
  const events: WeaveEvent[] = [
    { ...base(1), type: "task.started", cwd: "/proj", prompt: "x" },
    { ...base(2), type: "run.finished", status: "ok", wallMs: 10 },
    {
      ...base(3),
      type: "agent.message",
      update: { sessionUpdate: "plan", entries: [{ content: "Step A", status: "completed" }] },
    },
  ];
  const state = foldTaskState(events, "x", TASK_ID);
  assert.deepEqual(state.completed, ["Step A"]);
  assert.equal(state.atSeq, 3);
});

test("an empty event list folds to the empty default state", () => {
  const state = foldTaskState([], "x", TASK_ID);
  assert.equal(state.atSeq, 0);
  assert.deepEqual(state.completed, []);
  assert.deepEqual(state.inProgress, null);
  assert.deepEqual(state.inFlight, []);
  assert.deepEqual(state.decisions, []);
  assert.deepEqual(state.git, { branch: null, baseCommit: null, headCommit: null, dirty: [] });
});
