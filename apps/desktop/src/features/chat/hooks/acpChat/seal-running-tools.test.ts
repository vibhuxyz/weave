import test from "node:test";
import assert from "node:assert/strict";
import { sealRunningTools } from "./messageParsing.ts";
import type { ToolEntry } from "./types.ts";

const ENDED_AT = 1_700_000_100_000;

function tool(overrides: Partial<ToolEntry> & Pick<ToolEntry, "id" | "status">): ToolEntry {
  return { title: "Check directory", kind: "execute", ...overrides };
}

test("seals a call the engine left in progress", () => {
  const sealed = sealRunningTools(
    [tool({ id: "t1", status: "in_progress", startedAt: 1_700_000_000_000 })],
    ENDED_AT,
  );
  assert.equal(sealed[0]?.interrupted, true);
  assert.equal(sealed[0]?.endedAt, ENDED_AT);
  assert.equal(sealed[0]?.status, "in_progress");
});

test("seals a pending call too", () => {
  const sealed = sealRunningTools([tool({ id: "t1", status: "pending" })], ENDED_AT);
  assert.equal(sealed[0]?.interrupted, true);
});

test("returns the same array when every call already finished", () => {
  const tools = [tool({ id: "t1", status: "completed" }), tool({ id: "t2", status: "failed" })];
  assert.equal(sealRunningTools(tools, ENDED_AT), tools);
});

test("leaves a finished call untouched", () => {
  const sealed = sealRunningTools(
    [tool({ id: "t1", status: "completed", endedAt: 5 }), tool({ id: "t2", status: "in_progress" })],
    ENDED_AT,
  );
  assert.equal(sealed[0]?.interrupted, undefined);
  assert.equal(sealed[0]?.endedAt, 5);
  assert.equal(sealed[1]?.interrupted, true);
});

test("keeps an endedAt the engine already reported", () => {
  const sealed = sealRunningTools([tool({ id: "t1", status: "in_progress", endedAt: 42 })], ENDED_AT);
  assert.equal(sealed[0]?.endedAt, 42);
});

test("is idempotent", () => {
  const once = sealRunningTools([tool({ id: "t1", status: "in_progress" })], ENDED_AT);
  assert.equal(sealRunningTools(once, ENDED_AT + 5_000), once);
});
