import test from "node:test";
import assert from "node:assert/strict";
import { runCompaction } from "../run-compaction.ts";
import {
  CLAUDE_ACP_0_66_SUCCESS,
  COMMANDS_WITHOUT_COMPACT,
  COMMANDS_WITH_COMPACT,
  createHarness,
  primeSession,
  sendUserPrompt,
  timeline,
  usage,
} from "./index.ts";

const AT_THRESHOLD = 160_000;

function compactCount(lines: readonly string[]): number {
  return lines.filter((line) => line === "engine-prompt:/compact").length;
}

test("threshold boundaries: strict > and disabled values", () => {
  const cases: ReadonlyArray<[number, unknown, boolean]> = [
    [159_800, 0.8, false],
    [AT_THRESHOLD, 0.8, false],
    [160_200, 0.8, true],
    [199_000, 1, false],
    [199_000, 0, false],
    [199_000, Number.NaN, false],
    [199_000, "0.8", false],
    [199_000, undefined, true],
    [199_000, Number.POSITIVE_INFINITY, false],
    [199_000, -0.5, false],
  ];
  for (const [used, threshold, expected] of cases) {
    const harness = createHarness();
    primeSession(harness, used);
    assert.equal(harness.controller.shouldAutoCompact(harness.engine.sessionId, threshold), expected, `${used} @ ${String(threshold)}`);
  }
});

test("no compaction without a valid usage snapshot", () => {
  const harness = createHarness();
  harness.engine.emit(COMMANDS_WITH_COMPACT);
  assert.equal(harness.controller.shouldAutoCompact("session-1", 0.8), false);
  for (const bad of [usage(150_000, 0), usage(Number.NaN), usage(-1)]) {
    harness.engine.emit(bad);
    assert.equal(harness.controller.shouldAutoCompact("session-1", 0.8), false);
  }
});

test("replayed usage never triggers compaction", () => {
  const harness = createHarness();
  harness.engine.emit(COMMANDS_WITH_COMPACT);
  harness.engine.emit(usage(190_000), { isReplay: true });
  assert.equal(harness.controller.shouldAutoCompact("session-1", 0.8), false);
});

test("capabilities from a replay still count", () => {
  const harness = createHarness();
  harness.engine.emit(COMMANDS_WITH_COMPACT, { isReplay: true });
  assert.equal(harness.controller.stateFor("session-1").supportsCompaction, true);
});

test("an engine without /compact is never auto-compacted", () => {
  const harness = createHarness();
  harness.engine.emit(COMMANDS_WITHOUT_COMPACT);
  harness.engine.emit(usage(199_000));
  assert.equal(harness.controller.shouldAutoCompact("session-1", 0.8), false);
});

test("model change invalidates the usage snapshot", () => {
  const harness = createHarness();
  primeSession(harness, 190_000);
  harness.controller.invalidateContext("session-1");
  assert.equal(harness.controller.shouldAutoCompact("session-1", 0.8), false);
});

test("usage is tracked per session", () => {
  const harness = createHarness("session-a");
  primeSession(harness, 190_000);
  assert.equal(harness.controller.shouldAutoCompact("session-b", 0.8), false);
  assert.equal(harness.controller.shouldAutoCompact("session-a", 0.8), true);
});

test("no second compaction until a normal turn has completed", async () => {
  const harness = createHarness();
  primeSession(harness, 190_000);
  harness.engine.script({ kind: "respond", updates: [...CLAUDE_ACP_0_66_SUCCESS.slice(0, 1), usage(175_000)], stopReason: "end_turn" });
  await runCompaction({
    controller: harness.controller,
    session: harness.engine,
    operationId: "op-1",
    trigger: "manual",
    promptId: null,
    send: harness.send,
  });
  assert.equal(harness.controller.shouldAutoCompact("session-1", 0.8), false);

  harness.engine.script({ kind: "respond", updates: [usage(185_000)], stopReason: "end_turn" });
  await sendUserPrompt(harness, { text: "first", promptId: "p1" });
  assert.equal(compactCount(timeline(harness.log)), 1);
  assert.equal(harness.controller.shouldAutoCompact("session-1", 0.8), true);
});

test("capability changes are announced once per change", () => {
  const harness = createHarness();
  harness.engine.emit(COMMANDS_WITH_COMPACT);
  harness.engine.emit(COMMANDS_WITH_COMPACT);
  harness.engine.emit(COMMANDS_WITHOUT_COMPACT);
  assert.deepEqual(timeline(harness.log), ["capabilities:true", "capabilities:false"]);
});
