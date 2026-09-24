import test from "node:test";
import assert from "node:assert/strict";
import { appendTextSegment, appendToolSegment } from "./turn-segments";

test("text and tool calls keep the order they streamed in", () => {
  const afterText = appendTextSegment(appendTextSegment(undefined, "Checking "), "the repo.");
  const afterTools = appendToolSegment(appendToolSegment(afterText, "t1"), "t2");
  const segments = appendTextSegment(afterTools, "Done.");
  assert.deepEqual(segments, [
    { id: "s0", kind: "text", text: "Checking the repo." },
    { id: "s1", kind: "tools", toolIds: ["t1", "t2"] },
    { id: "s2", kind: "text", text: "Done." },
  ]);
});
