import test from "node:test";
import assert from "node:assert/strict";
import { runCompaction } from "../run-compaction.ts";
import { normalizeThreshold } from "../rules/index.ts";
import {
  CLAUDE_ACP_0_66_FAILURE,
  CLAUDE_ACP_0_66_SUCCESS,
  createHarness,
  primeSession,
  sendUserPrompt,
  timeline,
  type EngineScript,
  type Harness,
} from "./index.ts";

const COMPACTION_BUDGET_MS = 600_000;

function manual(harness: Harness, operationId: string) {
  return runCompaction({
    controller: harness.controller,
    session: harness.engine,
    operationId,
    trigger: "manual",
    promptId: null,
    send: harness.send,
  });
}

function compactPrompts(harness: Harness): number {
  return timeline(harness.log).filter((line) => line === "engine-prompt:/compact").length;
}

test("server normalizes the client threshold instead of trusting it", () => {
  assert.deepEqual(normalizeThreshold(undefined), { kind: "enabled", value: 0.8 });
  assert.deepEqual(normalizeThreshold(0.75), { kind: "enabled", value: 0.75 });
  assert.deepEqual(normalizeThreshold(0.123456789), { kind: "enabled", value: 0.123456789 });
  for (const off of [0, 1, 1.5, -0.2, Number.NaN, Number.POSITIVE_INFINITY, "0.8", null, {}]) {
    assert.deepEqual(normalizeThreshold(off), { kind: "off" }, String(off));
  }
});

test("a missing threshold falls back to 80%", async () => {
  const harness = createHarness();
  primeSession(harness, 170_000);
  assert.equal(harness.controller.shouldAutoCompact("session-1", undefined), true);
});

test("/compact gets the long compaction stall budget; normal prompts keep the default", async () => {
  const harness = createHarness();
  primeSession(harness, 170_000);
  harness.engine.script({ kind: "respond", updates: CLAUDE_ACP_0_66_SUCCESS, stopReason: "end_turn" });
  harness.engine.script({ kind: "respond", updates: [], stopReason: "end_turn" });

  await sendUserPrompt(harness, { text: "go", promptId: "p1" });

  const budgets = harness.log.flatMap((entry) => (entry.kind === "engine-prompt" ? [[entry.text, entry.stallTimeoutMs]] : []));
  assert.deepEqual(budgets, [["/compact", COMPACTION_BUDGET_MS], ["go", undefined]]);
});

const SETTLED_SCRIPTS: ReadonlyArray<[string, EngineScript]> = [
  ["completed", { kind: "respond", updates: CLAUDE_ACP_0_66_SUCCESS, stopReason: "end_turn" }],
  ["failed", { kind: "respond", updates: CLAUDE_ACP_0_66_FAILURE, stopReason: "end_turn" }],
  ["stalled", { kind: "disconnect", updates: [], message: "Claude Code stopped responding" }],
];

for (const [label, script] of SETTLED_SCRIPTS) {
  test(`an operation id reused after a ${label} run never runs /compact again`, async () => {
    const harness = createHarness();
    primeSession(harness, 170_000);
    harness.engine.script(script);
    await manual(harness, "op-1");
    const retry = await manual(harness, "op-1");
    assert.equal(retry.kind, "duplicate");
    assert.equal(compactPrompts(harness), 1);
  });
}

test("an operation id reused after a cancelled run is a duplicate too", async () => {
  const harness = createHarness();
  primeSession(harness, 170_000);
  harness.engine.script({ kind: "wait-for-cancel", updates: [] });
  const running = manual(harness, "op-1");
  await Promise.resolve();
  harness.engine.cancel();
  await running;
  assert.equal((await manual(harness, "op-1")).kind, "duplicate");
  assert.equal(compactPrompts(harness), 1);
});

test("an id refused as busy is not remembered, so the caller can retry it later", async () => {
  const harness = createHarness();
  primeSession(harness, 170_000);
  harness.engine.script({ kind: "wait-for-cancel", updates: [] });
  const running = manual(harness, "op-1");
  const refused = await manual(harness, "op-2");
  harness.engine.cancel();
  await running;
  harness.engine.script({ kind: "respond", updates: CLAUDE_ACP_0_66_SUCCESS, stopReason: "end_turn" });
  const retried = await manual(harness, "op-2");
  assert.equal(refused.kind === "ran" && refused.outcome.status, "failed");
  assert.equal(retried.kind === "ran" && retried.outcome.status, "completed");
});

test("remembered ids are bounded per connection", async () => {
  const harness = createHarness();
  primeSession(harness, 170_000);
  for (let index = 0; index < 70; index += 1) {
    harness.engine.script({ kind: "respond", updates: [], stopReason: "end_turn" });
    await manual(harness, `op-${index}`);
  }
  harness.engine.script({ kind: "respond", updates: [], stopReason: "end_turn" });
  assert.equal((await manual(harness, "op-0")).kind, "ran", "oldest id aged out of the 64-entry window");
  assert.equal((await manual(harness, "op-69")).kind, "duplicate");
});

test("isCompacting is true only while an operation runs", async () => {
  const harness = createHarness();
  primeSession(harness, 170_000);
  harness.engine.script({ kind: "wait-for-cancel", updates: [] });
  const running = manual(harness, "op-1");
  assert.equal(harness.controller.isCompacting(), true);
  harness.engine.cancel();
  await running;
  assert.equal(harness.controller.isCompacting(), false);
});

test("a late event from an earlier compaction cannot settle the next one", async () => {
  const harness = createHarness();
  primeSession(harness, 170_000);
  harness.engine.script({ kind: "respond", updates: CLAUDE_ACP_0_66_SUCCESS, stopReason: "end_turn" });
  await manual(harness, "op-1");
  assert.equal(harness.controller.end("op-1"), null);

  harness.engine.script({ kind: "wait-for-cancel", updates: [] });
  const second = manual(harness, "op-2");
  assert.equal(harness.controller.end("op-1"), null, "stale id does not end the active op");
  assert.equal(harness.controller.isCompacting(), true);
  harness.engine.cancel();
  await second;
});

test("a completed compaction carries the engine summary; a failing reader reports and continues", async () => {
  const harness = createHarness();
  primeSession(harness, 170_000);
  harness.engine.script({ kind: "respond", updates: CLAUDE_ACP_0_66_SUCCESS, stopReason: "end_turn" });
  await runCompaction({
    controller: harness.controller, session: harness.engine, operationId: "op-1", trigger: "manual",
    promptId: null, send: harness.send, readSummary: async () => "Summary: built V1.2",
  });
  harness.engine.script({ kind: "respond", updates: CLAUDE_ACP_0_66_SUCCESS, stopReason: "end_turn" });
  await runCompaction({
    controller: harness.controller, session: harness.engine, operationId: "op-2", trigger: "manual",
    promptId: null, send: harness.send, readSummary: async () => { throw new Error("EACCES"); },
  });
  const completed = harness.log.flatMap((entry) =>
    entry.kind === "server" && entry.msg.type === "compaction" && entry.msg.status === "completed" ? [entry.msg.summary] : [],
  );
  assert.deepEqual(completed, ["Summary: built V1.2", null]);
  const errors = harness.log.flatMap((entry) => (entry.kind === "server" && entry.msg.type === "error" ? [entry.msg.message] : []));
  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? "", /summary could not be read/);
});
