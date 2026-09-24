import test from "node:test";
import assert from "node:assert/strict";
import { compressToolOutput } from "./compress.ts";

test("short output only loses colour codes, progress redraws and blank lines", () => {
  const raw = "\u001b[32mPASS\u001b[0m a.test.ts\r\n\nDownloading 10%\rDownloading 100%\n";
  assert.equal(compressToolOutput(raw), "PASS a.test.ts\nDownloading 100%");
});

test("repeated lines collapse into one with a count", () => {
  assert.equal(compressToolOutput("warn: deprecated\nwarn: deprecated\nwarn: deprecated\ndone"), "warn: deprecated (×3)\ndone");
});

test("a long failing test run keeps the head, the tail and every error line in the middle", () => {
  const noise = Array.from({ length: 400 }, (_, index) => `  ✓ passing test number ${index}`);
  const raw = [
    "> vitest run",
    ...noise.slice(0, 200),
    "  ✖ cart total > applies discount",
    "    AssertionError: expected 90 to equal 81",
    ...noise.slice(200),
    "Tests: 1 failed, 400 passed",
  ].join("\n");
  const compressed = compressToolOutput(raw, 4_000);
  assert.ok(compressed.length <= 4_000);
  assert.ok(compressed.startsWith("> vitest run"));
  assert.ok(compressed.includes("✖ cart total > applies discount"));
  assert.ok(compressed.includes("AssertionError: expected 90 to equal 81"));
  assert.ok(compressed.endsWith("Tests: 1 failed, 400 passed"));
  assert.match(compressed, /… \d+ line\(s\) omitted …/);
});

test("the budget always holds, even when every line looks like an error", () => {
  const raw = Array.from({ length: 5_000 }, (_, index) => `error TS2322: problem ${index} ${"x".repeat(300)}`).join("\n");
  for (const budget of [0, 50, 1_000, 4_000]) {
    assert.ok(compressToolOutput(raw, budget).length <= budget, `budget ${budget}`);
  }
});

test("the same input always compresses the same way", () => {
  const raw = Array.from({ length: 300 }, (_, index) => (index % 17 === 0 ? `FAIL case ${index}` : `ok ${index}`)).join("\n");
  assert.equal(compressToolOutput(raw, 1_500), compressToolOutput(raw, 1_500));
});
