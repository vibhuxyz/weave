import test from "node:test";
import assert from "node:assert/strict";
import { compactionSummary, failureDetail, recordNoticeUsage, settleNotice, startNotice, usageChangeLabel } from "./notice.ts";
import { latestContextUsage, toContextUsage } from "./context-usage.ts";
import { rememberCapability } from "./capabilities.ts";
import type { CompactionNotice } from "./types.ts";

const LIMIT = 200_000;
const STARTED_AT = 1_700_000_000_000;

function running(): CompactionNotice {
  return startNotice(
    { operationId: "op-1", trigger: "automatic", contextBefore: { contextTokens: 164_000, contextLimit: LIMIT } },
    STARTED_AT,
  );
}

test("completed notice shows the before and after percentage", () => {
  const settled = settleNotice(running(), {
    status: "completed",
    contextAfter: { contextTokens: 62_000, contextLimit: LIMIT },
    summary: "Summary: work so far",
  }, STARTED_AT + 38_000);
  assert.equal(settled.status, "completed");
  assert.equal(usageChangeLabel(settled), "82% → 31%");
  assert.deepEqual(compactionSummary(settled), { beforePercent: 82, afterPercent: 31, freedTokens: 102_000, reductionPercent: 62 });
  assert.equal(settled.settledAt, STARTED_AT + 38_000);
  assert.equal(settled.summary, "Summary: work so far");
});

test("completed without a server figure keeps the live usage seen during compaction", () => {
  const withUsage = recordNoticeUsage(running(), { contextTokens: 40_000, contextLimit: LIMIT });
  const settled = settleNotice(withUsage, { status: "completed", contextAfter: null, summary: null }, STARTED_AT);
  assert.equal(usageChangeLabel(settled), "82% → 20%");
});

test("a settled notice ignores late settlements and usage", () => {
  const cancelled = settleNotice(running(), { status: "cancelled" }, STARTED_AT + 1);
  assert.equal(settleNotice(cancelled, { status: "completed", contextAfter: null, summary: null }, STARTED_AT + 2).status, "cancelled");
  assert.equal(recordNoticeUsage(cancelled, { contextTokens: 1, contextLimit: LIMIT }), cancelled);
});

test("failure detail is flattened and bounded", () => {
  const failed = settleNotice(running(), { status: "failed", reason: `line one\n${"x".repeat(500)}` }, STARTED_AT);
  const detail = failureDetail(failed) ?? "";
  assert.ok(detail.startsWith("line one x"));
  assert.equal(detail.length, 240);
});

test("context usage rejects malformed values and uses the newest valid reading", () => {
  assert.equal(toContextUsage(10, 0), null);
  assert.equal(toContextUsage(Number.NaN, LIMIT), null);
  assert.equal(toContextUsage(-1, LIMIT), null);
  const turns = [
    { usage: { contextUsed: 90_000, contextSize: LIMIT } },
    { usage: { contextUsed: 12_000, contextSize: 0 } },
    {},
  ];
  assert.deepEqual(latestContextUsage(turns), { contextTokens: 90_000, contextLimit: LIMIT });
});

test("capabilities are remembered per session and bounded", () => {
  let capabilities = rememberCapability(new Map(), "a", true);
  for (let index = 0; index < 40; index += 1) capabilities = rememberCapability(capabilities, `s${index}`, false);
  assert.equal(capabilities.size, 32);
  assert.equal(capabilities.has("a"), false);
  assert.equal(rememberCapability(capabilities, "s39", true).get("s39"), true);
});
