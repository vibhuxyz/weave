import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WeaveEvent } from "@weave/protocol";
import { foldTaskState } from "./state.ts";
import { readCheckpoint, readLatest, shouldCheckpoint, writeCheckpoint } from "./checkpoint.ts";

const RUN_ID = "run-1";
const TASK_ID = "T1";

function base(seq: number) {
  return { runId: RUN_ID, seq, at: "2026-09-13T00:00:00.000Z", taskId: TASK_ID };
}

const EVENTS: WeaveEvent[] = [
  { ...base(1), type: "task.started", cwd: "/proj", prompt: "Build a Todo API" },
  {
    ...base(2),
    type: "agent.message",
    update: {
      sessionUpdate: "plan",
      entries: [{ content: "Scaffold server", status: "completed" }],
    },
  },
  { ...base(3), type: "file.written", path: "apps/api/src/server.ts", bytes: 512 },
  {
    ...base(4),
    type: "verification.rung",
    rung: "typecheck",
    strength: 3,
    command: "tsc --noEmit",
    ok: true,
    wallMs: 900,
  },
  { ...base(5), type: "task.finished", status: "cancelled", wallMs: 4000 },
];

test("shouldCheckpoint fires on milestones and never on plain streaming", () => {
  const midState = foldTaskState(EVENTS.slice(0, 2), "Build a Todo API", TASK_ID);
  assert.deepEqual(shouldCheckpoint(EVENTS[1], midState), { checkpoint: true, reason: "test_milestone" });

  const afterWrite = foldTaskState(EVENTS.slice(0, 3), "Build a Todo API", TASK_ID);
  assert.deepEqual(shouldCheckpoint(EVENTS[2], afterWrite), { checkpoint: true, reason: "file_milestone" });

  const afterVerify = foldTaskState(EVENTS.slice(0, 4), "Build a Todo API", TASK_ID);
  assert.deepEqual(shouldCheckpoint(EVENTS[3], afterVerify), { checkpoint: true, reason: "verification_milestone" });

  const afterFinish = foldTaskState(EVENTS, "Build a Todo API", TASK_ID);
  assert.deepEqual(shouldCheckpoint(EVENTS[4], afterFinish), { checkpoint: true, reason: "user_cancellation" });

  // A raw content chunk (streamed tokens) must never trigger a checkpoint.
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
    let state = foldTaskState(EVENTS.slice(0, 2), "Build a Todo API", TASK_ID);
    const cp1 = await writeCheckpoint(weaveDir, TASK_ID, state, "test_milestone");
    assert.equal(cp1.seq, 2);

    state = foldTaskState(EVENTS.slice(0, 3), "Build a Todo API", TASK_ID);
    await writeCheckpoint(weaveDir, TASK_ID, state, "file_milestone");

    state = foldTaskState(EVENTS, "Build a Todo API", TASK_ID);
    const last = await writeCheckpoint(weaveDir, TASK_ID, state, "user_cancellation");

    // The chain: the earlier checkpoint is still there, untouched.
    const first = await readCheckpoint(weaveDir, TASK_ID, 2);
    assert.deepEqual(first?.state.completed, ["Scaffold server"]);

    // latest.json points at the last one written.
    const latest = await readLatest(weaveDir, TASK_ID);
    assert.equal(latest?.seq, last.seq);
    assert.equal(latest?.reason, "user_cancellation");

    // The done-when criterion: the last checkpoint's state matches
    // re-folding the whole ledger from scratch. Round-trip the refold
    // through JSON too — `undefined` fields vanish on the wire, and the
    // comparison should reflect what a reader actually gets back.
    const refolded = foldTaskState(EVENTS, "Build a Todo API", TASK_ID);
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
