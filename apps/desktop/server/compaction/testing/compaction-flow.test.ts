import test from "node:test";
import assert from "node:assert/strict";
import { runCompaction } from "../run-compaction.ts";
import {
  CLAUDE_ACP_0_66_FAILURE,
  CLAUDE_ACP_0_66_SUCCESS,
  CODEX_ACP_1_8_SUCCESS,
  agentText,
  compactionEvents,
  createHarness,
  primeSession,
  sendUserPrompt,
  timeline,
  usage,
} from "./index.ts";

const NEAR_FULL = 170_000;

test("claude success: compact settles before the user prompt is sent", async () => {
  const harness = createHarness();
  primeSession(harness, NEAR_FULL);
  harness.engine.script({ kind: "respond", updates: CLAUDE_ACP_0_66_SUCCESS, stopReason: "end_turn" });
  harness.engine.script({ kind: "respond", updates: [usage(40_000)], stopReason: "end_turn" });

  await sendUserPrompt(harness, { text: "next step", promptId: "p1" });

  assert.deepEqual(timeline(harness.log), [
    "capabilities:true",
    "compaction:started",
    "engine-prompt:/compact",
    "compaction:completed",
    "engine-prompt:next step",
    "turn-end",
  ]);
  const [started, completed] = compactionEvents(harness.log);
  assert.equal(started?.status === "started" && started.trigger, "automatic");
  assert.deepEqual(started?.status === "started" && started.contextBefore, { contextTokens: NEAR_FULL, contextLimit: 200_000 });
  assert.deepEqual(completed?.status === "completed" && completed.contextAfter, { contextTokens: 31_000, contextLimit: 200_000 });
});

test("claude failure: reports failed and still sends the prompt", async () => {
  const harness = createHarness();
  primeSession(harness, NEAR_FULL);
  harness.engine.script({ kind: "respond", updates: CLAUDE_ACP_0_66_FAILURE, stopReason: "end_turn" });
  harness.engine.script({ kind: "respond", updates: [], stopReason: "end_turn" });

  await sendUserPrompt(harness, { text: "next step", promptId: "p1" });

  const settled = compactionEvents(harness.log).at(-1);
  assert.equal(settled?.status, "failed");
  assert.equal(settled?.status === "failed" && settled.reason, "Compacting failed: Not enough messages to compact.");
  assert.ok(timeline(harness.log).includes("engine-prompt:next step"));
});

test("codex success: structured compaction marker completes the operation", async () => {
  const harness = createHarness();
  primeSession(harness, NEAR_FULL);
  harness.engine.script({ kind: "respond", updates: CODEX_ACP_1_8_SUCCESS, stopReason: "end_turn" });
  harness.engine.script({ kind: "respond", updates: [], stopReason: "end_turn" });

  await sendUserPrompt(harness, { text: "go", promptId: "p1" });

  const settled = compactionEvents(harness.log).at(-1);
  assert.equal(settled?.status, "completed");
  assert.deepEqual(settled?.status === "completed" && settled.contextAfter, { contextTokens: 24_000, contextLimit: 200_000 });
});

test("cancel during auto-compaction withdraws the prompt and never sends it", async () => {
  const harness = createHarness();
  primeSession(harness, NEAR_FULL);
  harness.engine.script({ kind: "wait-for-cancel", updates: [agentText("Compacting...")] });

  const pending = sendUserPrompt(harness, { text: "do not send", promptId: "p1" });
  await Promise.resolve();
  harness.engine.cancel();
  const result = await pending;

  assert.equal(result.kind, "withdrawn");
  assert.deepEqual(timeline(harness.log), [
    "capabilities:true",
    "compaction:started",
    "engine-prompt:/compact",
    "compaction:cancelled",
    "withdrawn:p1",
  ]);
});

test("disconnect during compaction fails with the error and surfaces it", async () => {
  const harness = createHarness();
  primeSession(harness, NEAR_FULL);
  harness.engine.script({ kind: "disconnect", updates: [agentText("Compacting...")], message: "engine exited" });

  const result = await runCompaction({
    controller: harness.controller,
    session: harness.engine,
    operationId: "op-1",
    trigger: "manual",
    promptId: null,
    send: harness.send,
  });

  assert.equal(result.kind === "ran" && result.outcome.status, "failed");
  assert.match(result.kind === "ran" && result.outcome.status === "failed" ? result.outcome.reason : "", /engine exited/);
  assert.ok(result.kind === "ran" && result.error instanceof Error);
});

test("a retried operation id runs /compact only once", async () => {
  const harness = createHarness();
  primeSession(harness, NEAR_FULL);
  harness.engine.script({ kind: "respond", updates: CLAUDE_ACP_0_66_SUCCESS, stopReason: "end_turn" });
  const options = {
    controller: harness.controller,
    session: harness.engine,
    operationId: "op-1",
    trigger: "manual" as const,
    promptId: null,
    send: harness.send,
  };

  const first = await runCompaction(options);
  const retry = await runCompaction(options);

  assert.equal(first.kind, "ran");
  assert.equal(retry.kind, "duplicate");
  assert.equal(timeline(harness.log).filter((line) => line === "engine-prompt:/compact").length, 1);
});

test("a second compaction while one runs is refused", async () => {
  const harness = createHarness();
  primeSession(harness, NEAR_FULL);
  harness.engine.script({ kind: "wait-for-cancel", updates: [] });
  const base = { controller: harness.controller, session: harness.engine, trigger: "manual" as const, promptId: null, send: harness.send };

  const running = runCompaction({ ...base, operationId: "op-1" });
  const refused = await runCompaction({ ...base, operationId: "op-2" });
  harness.engine.cancel();
  await running;

  assert.equal(refused.kind === "ran" && refused.outcome.status, "failed");
});

test("late updates after settle do not rewrite the outcome or re-arm auto-compaction", async () => {
  const harness = createHarness();
  primeSession(harness, NEAR_FULL);
  harness.engine.script({ kind: "respond", updates: CLAUDE_ACP_0_66_SUCCESS, stopReason: "end_turn" });
  await runCompaction({
    controller: harness.controller,
    session: harness.engine,
    operationId: "op-1",
    trigger: "manual",
    promptId: null,
    send: harness.send,
  });

  harness.engine.emit(agentText("\n\nCompacting failed: late"));
  harness.engine.emit(usage(NEAR_FULL));

  assert.deepEqual(compactionEvents(harness.log).map((event) => event.status), ["started", "completed"]);
  assert.equal(harness.controller.shouldAutoCompact(harness.engine.sessionId, 0.8), false);
});
