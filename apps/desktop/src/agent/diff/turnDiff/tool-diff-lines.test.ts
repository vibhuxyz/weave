import test from "node:test";
import assert from "node:assert/strict";
import { toolDiffLines } from "./tool-diff-lines";

test("a created file previews every line as added", () => {
  const { lines } = toolDiffLines({ path: "a.ts", oldText: null, newText: "one\ntwo" });
  assert.deepEqual(lines.map((line) => [line.kind, line.text]), [["add", "one"], ["add", "two"]]);
});

test("an edit previews removed and added lines", () => {
  const { lines } = toolDiffLines({ path: "a.ts", oldText: "keep\nold", newText: "keep\nnew" });
  assert.deepEqual(
    lines.filter((line) => line.kind !== "context").map((line) => [line.kind, line.text]),
    [["del", "old"], ["add", "new"]],
  );
});
