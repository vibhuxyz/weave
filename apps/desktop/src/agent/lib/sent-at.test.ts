import test from "node:test";
import assert from "node:assert/strict";
import { sentAgo } from "./sent-at";

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);

test("a prompt from under 45 seconds ago was sent just now", () => {
  assert.deepEqual(sentAgo(NOW - 10_000, NOW), { unit: "just-now" });
  assert.deepEqual(sentAgo(NOW + 5_000, NOW), { unit: "just-now" });
});

test("older prompts read as minutes, then hours, then a date", () => {
  assert.deepEqual(sentAgo(NOW - 5 * 60_000, NOW), { unit: "minute", count: 5 });
  assert.deepEqual(sentAgo(NOW - 3 * 3_600_000, NOW), { unit: "hour", count: 3 });
  assert.deepEqual(sentAgo(NOW - 3 * 86_400_000, NOW), { unit: "date" });
});
