import test from "node:test";
import assert from "node:assert/strict";
import type { ToolEntry } from "@/features/chat/hooks";
import { testRunFromTools } from "./testRun";

function step(
  id: string,
  title: string,
  status: ToolEntry["status"],
  output: string,
): ToolEntry {
  return { id, title, status, kind: "execute", output };
}

const FAILING_SUITE = "12 pass\n1 fail\nerror: 1 test failed";
const PASSING_SUITE = "13 pass\n0 fail\nTests: 13 passed";

test("a suite that failed then passed is recovered, not failed", () => {
  const block = testRunFromTools([
    step("1", "Run bun test", "failed", FAILING_SUITE),
    step("2", "Run bun run test", "completed", PASSING_SUITE),
  ]);
  assert.equal(block?.status, "recovered");
  assert.equal(block?.steps[0]?.superseded, true);
  assert.equal(block?.steps[1]?.superseded, false);
});

test("the failed step stays in the log rather than being rewritten", () => {
  const block = testRunFromTools([
    step("1", "Run bun test", "failed", FAILING_SUITE),
    step("2", "Run bun run test", "completed", PASSING_SUITE),
  ]);
  assert.equal(block?.steps.length, 2);
  assert.equal(block?.steps[0]?.status, "failed");
  assert.equal(block?.steps[0]?.badge, "1 failed");
});

test("a failure with no later run stays failed", () => {
  const block = testRunFromTools([
    step("1", "Run bun test", "failed", FAILING_SUITE),
    step("2", "List files", "completed", "a.ts\nb.ts"),
  ]);
  assert.equal(block?.status, "failed");
  assert.equal(block?.steps[0]?.superseded, false);
});

test("a passing build does not answer a failing suite", () => {
  const block = testRunFromTools([
    step("1", "Run bun test", "failed", FAILING_SUITE),
    step("2", "Run logger build", "completed", "bundled in 1.2s\nexit code 0"),
  ]);
  assert.equal(block?.status, "failed");
});

test("a failure after the last passing run is still outstanding", () => {
  const block = testRunFromTools([
    step("1", "Run bun test", "failed", FAILING_SUITE),
    step("2", "Run bun run test", "completed", PASSING_SUITE),
    step("3", "Run bun test again", "failed", FAILING_SUITE),
  ]);
  assert.equal(block?.status, "failed");
  assert.equal(block?.steps[0]?.superseded, true);
  assert.equal(block?.steps[2]?.superseded, false);
});

test("a run still going is reported as running, not recovered", () => {
  const block = testRunFromTools([
    step("1", "Run bun test", "failed", FAILING_SUITE),
    step("2", "Run bun run test", "completed", PASSING_SUITE),
    step("3", "Run turbo run check-types", "in_progress", ""),
  ]);
  assert.equal(block?.status, "running");
});

test("an all-green run is still simply passed", () => {
  const block = testRunFromTools([
    step("1", "Run bun test", "completed", PASSING_SUITE),
    step("2", "Run build", "completed", "exit code 0"),
  ]);
  assert.equal(block?.status, "passed");
});

test("the sequence from the reported run ends recovered", () => {
  const block = testRunFromTools([
    step("1", "Run bun test", "failed", FAILING_SUITE),
    step("2", "Run bun run test", "completed", PASSING_SUITE),
    step("3", "Run bun test on packages/logger", "completed", ""),
    step("4", "Run logger build", "completed", "exit code 0"),
    step("5", "List files in apps/api/test", "completed", "tracing.test.ts"),
    step("6", "Run full test suite via bun run test", "completed", PASSING_SUITE),
  ]);
  assert.equal(block?.status, "recovered");
  assert.equal(block?.steps.filter((s) => s.superseded).length, 1);
});
