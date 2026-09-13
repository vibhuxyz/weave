// Hidden grader — weight 0.2.
import test from "node:test";
import assert from "node:assert/strict";
import type { WeaveEvent } from "../src/protocol/index.ts";
import { foldTaskState } from "../src/state.ts";

const TASK_ID = "T1";
function base(seq: number) {
  return { runId: "run-1", seq, at: "2026-09-13T00:00:00.000Z", taskId: TASK_ID };
}

const EVENTS: WeaveEvent[] = [
  { ...base(1), type: "task.started", cwd: "/proj", prompt: "Build a Todo API" },
  {
    ...base(2),
    type: "agent.message",
    update: { sessionUpdate: "plan", entries: [{ content: "Scaffold server", status: "completed" }] },
  },
  { ...base(3), type: "file.written", path: "server.ts", bytes: 10 },
];

test("foldTaskState is pure: same events in, same state out", () => {
  const a = foldTaskState(EVENTS, "Build a Todo API", TASK_ID);
  const b = foldTaskState(EVENTS, "Build a Todo API", TASK_ID);
  assert.deepEqual(a, b);
});

test("foldTaskState does not mutate its input", () => {
  const before = JSON.stringify(EVENTS);
  foldTaskState(EVENTS, "Build a Todo API", TASK_ID);
  assert.equal(JSON.stringify(EVENTS), before);
});
