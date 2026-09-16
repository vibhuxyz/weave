import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WeaveEvent } from "@weave/protocol";
import { foldTaskState } from "../state/index.ts";
import { readCheckpoint, readLatest, shouldCheckpoint, writeCheckpoint } from "./checkpoint.ts";

const RUN_ID = "run-1";
const TASK_ID = "T1";
const GOAL = "Build a Todo API";

function base(seq: number) {
  return { runId: RUN_ID, seq, at: "2026-09-13T00:00:00.000Z", taskId: TASK_ID };
}

const TASK_STARTED: WeaveEvent = { ...base(1), type: "task.started", cwd: "/proj", prompt: GOAL };
const PLAN_UPDATE: WeaveEvent = {
  ...base(2),
  type: "agent.message",
  update: {
    sessionUpdate: "plan",
    entries: [{ content: "Scaffold server", status: "completed" }],
  },
};
const FILE_WRITTEN: WeaveEvent = { ...base(3), type: "file.written", path: "apps/api/src/server.ts", bytes: 512 };
const VERIFICATION_RUNG: WeaveEvent = {
  ...base(4),
  type: "verification.rung",
  rung: "typecheck",
  strength: 3,
  command: "tsc --noEmit",
  ok: true,
  wallMs: 900,
};
const TASK_FINISHED: WeaveEvent = { ...base(5), type: "task.finished", status: "cancelled", wallMs: 4000 };

const EVENTS: WeaveEvent[] = [TASK_STARTED, PLAN_UPDATE, FILE_WRITTEN, VERIFICATION_RUNG, TASK_FINISHED];

test("shouldCheckpoint fires on milestones and never on plain streaming", () => {
  const midState = foldTaskState(EVENTS.slice(0, 2), GOAL, TASK_ID);
  assert.deepEqual(shouldCheckpoint(PLAN_UPDATE, midState), { checkpoint: true, reason: "test_milestone" });

  const afterWrite = foldTaskState(EVENTS.slice(0, 3), GOAL, TASK_ID);
  assert.deepEqual(shouldCheckpoint(FILE_WRITTEN, afterWrite), { checkpoint: true, reason: "file_milestone" });

  const afterVerify = foldTaskState(EVENTS.slice(0, 4), GOAL, TASK_ID);
  assert.deepEqual(shouldCheckpoint(VERIFICATION_RUNG, afterVerify), {
    checkpoint: true,
    reason: "verification_milestone",
  });

  const afterFinish = foldTaskState(EVENTS, GOAL, TASK_ID);
  assert.deepEqual(shouldCheckpoint(TASK_FINISHED, afterFinish), { checkpoint: true, reason: "user_cancellation" });

  const chunkEvent: WeaveEvent = {
    ...base(6),
    type: "agent.message",
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } },
  };
  assert.deepEqual(shouldCheckpoint(chunkEvent, afterFinish), { checkpoint: false });
});

test("writeCheckpoint / readLatest / readCheckpoint round-trip, and the chain re-folds identically", async () => {
  const weaveDir = await mkdtemp(join(tmpdir(), "weave-checkpoint-test-"));
  try {
    let state = foldTaskState(EVENTS.slice(0, 2), GOAL, TASK_ID);
    const cp1 = await writeCheckpoint(weaveDir, TASK_ID, state, "test_milestone");
    assert.equal(cp1.seq, 2);

    state = foldTaskState(EVENTS.slice(0, 3), GOAL, TASK_ID);
    await writeCheckpoint(weaveDir, TASK_ID, state, "file_milestone");

    state = foldTaskState(EVENTS, GOAL, TASK_ID);
    const last = await writeCheckpoint(weaveDir, TASK_ID, state, "user_cancellation");

    const first = await readCheckpoint(weaveDir, TASK_ID, 2);
    assert.deepEqual(first?.state.completed, ["Scaffold server"]);

    const latest = await readLatest(weaveDir, TASK_ID);
    assert.equal(latest?.seq, last.seq);
    assert.equal(latest?.reason, "user_cancellation");

    const refolded = foldTaskState(EVENTS, GOAL, TASK_ID);
    assert.deepEqual(latest?.state, JSON.parse(JSON.stringify(refolded)));
  } finally {
    await rm(weaveDir, { recursive: true, force: true });
  }
});

test("readLatest / readCheckpoint return null when nothing was written", async () => {
  const weaveDir = await mkdtemp(join(tmpdir(), "weave-checkpoint-test-"));
  try {
    assert.equal(await readLatest(weaveDir, "nope"), null);
    assert.equal(await readCheckpoint(weaveDir, "nope", 1), null);
  } finally {
    await rm(weaveDir, { recursive: true, force: true });
  }
});
