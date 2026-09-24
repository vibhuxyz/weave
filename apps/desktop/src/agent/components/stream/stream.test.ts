import test from "node:test";
import assert from "node:assert/strict";
import type { ToolEntry } from "@/features/chat/hooks";
import { segmentsOf } from "./segments";
import { groupLabel, rowSubject, rowVerb } from "./tool-label";

const tool = (fields: Partial<ToolEntry> & Pick<ToolEntry, "id" | "kind">): ToolEntry => ({ title: "Terminal", status: "completed", ...fields });

test("a turn saved before segments existed shows its tools, then its text", () => {
  const segments = segmentsOf({ text: "answer", tools: [tool({ id: "t1", kind: "execute" })] });
  assert.deepEqual(segments.map((segment) => segment.kind), ["tools", "text"]);
});

test("a group reads like 'Ran 2 commands, read MVP.md, created a.ts'", () => {
  const tools = [
    tool({ id: "1", kind: "execute", rawInput: { command: "git status" } }),
    tool({ id: "2", kind: "read", title: "Read /repo/docs/MVP.md" }),
    tool({ id: "3", kind: "execute", rawInput: { command: "bun install" } }),
    tool({ id: "4", kind: "edit", title: "Write a.ts", diffs: [{ path: "/repo/src/a.ts", oldText: null, newText: "x" }] }),
  ];
  assert.equal(groupLabel(tools), "Ran 2 commands, read MVP.md, created a.ts");
  assert.equal(groupLabel([tools[0] ?? tool({ id: "x", kind: "execute" })]), "Ran a command");
});

test("a row names its command, and says what it is doing while it runs", () => {
  const shell = tool({ id: "1", kind: "execute", rawInput: { command: "bun install\n--frozen-lockfile" } });
  assert.equal(`${rowVerb(shell, false)} ${rowSubject(shell)}`, "Ran bun install");
  assert.equal(rowVerb(shell, true), "Running");
  const long = tool({ id: "2", kind: "execute", rawInput: { command: "x".repeat(100) } });
  assert.ok(rowSubject(long).endsWith("…"));
});
