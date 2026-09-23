import test from "node:test";
import assert from "node:assert/strict";
import { classifyCompaction } from "../rules/index.ts";

const ok = { stopReason: "end_turn", engineStatus: null, contextAfter: null } as const;

function statusFor(engineText: string): string {
  return classifyCompaction({ ...ok, engineText }).status;
}

test("stop reason decides cancel and hard failure before any text", () => {
  assert.equal(classifyCompaction({ ...ok, stopReason: "cancelled", engineText: "Compacting completed." }).status, "cancelled");
  assert.equal(classifyCompaction({ ...ok, stopReason: "max_tokens", engineText: "Compacting completed." }).status, "failed");
  assert.equal(classifyCompaction({ ...ok, stopReason: "refusal", engineText: "" }).status, "failed");
});

test("structured engine status wins over text", () => {
  assert.equal(classifyCompaction({ ...ok, engineStatus: "completed", engineText: "Compacting failed." }).status, "completed");
  assert.equal(classifyCompaction({ ...ok, engineStatus: "failed", engineText: "Compacting completed." }).status, "failed");
});

test("adapter text fallback", () => {
  assert.equal(statusFor(""), "completed");
  assert.equal(statusFor("Compacting...\n\nCompacting completed.   \n"), "completed");
  assert.equal(statusFor("Compacting...\r\n\r\nCompacting failed."), "failed");
  assert.equal(statusFor("Compacting...\n\nCompacting failed: API error\n"), "failed");
  assert.equal(statusFor("Compacting...\n\nCompacting completed.\n\nCompacting failed: second attempt"), "failed");
  assert.equal(statusFor("Compacting failed: partial"), "failed");
});

test("text that only mentions failure is not a failure", () => {
  assert.equal(statusFor("**Compacting failed**"), "completed");
  assert.equal(statusFor("> Compacting failed: quoted"), "completed");
  assert.equal(statusFor("The previous Compacting failed message was wrong."), "completed");
  assert.equal(statusFor("Compactage échoué"), "completed");
});
