import test from "node:test";
import assert from "node:assert/strict";
import type { ToolEntry } from "@/features/chat/hooks";
import { tokenizeCommand } from "./command-tokens";
import { groupLabel, rowSubject, rowVerb, runningLabel } from "./tool-label";

const tool = (fields: Partial<ToolEntry> & Pick<ToolEntry, "id" | "kind">): ToolEntry => ({ title: "Terminal", status: "completed", ...fields });

test("a group reads like 'Ran 2 commands, read MVP.md, created a.ts'", () => {
  const tools = [
    tool({ id: "1", kind: "execute", rawInput: { command: "git status" } }),
    tool({ id: "2", kind: "read", title: "Read /repo/docs/MVP.md" }),
    tool({ id: "3", kind: "execute", rawInput: { command: "bun install" } }),
    tool({ id: "4", kind: "edit", title: "Write a.ts", diffs: [{ path: "/repo/src/a.ts", oldText: null, newText: "x" }] }),
  ];
  assert.equal(groupLabel(tools), "Ran 2 commands, read MVP.md, created a.ts");
  assert.equal(groupLabel([tools[0] ?? tool({ id: "x", kind: "execute" })]), "Ran a command");
  assert.equal(groupLabel([tool({ id: "5", kind: "execute" }), tool({ id: "6", kind: "execute", status: "failed" })]), "Ran 2 commands (1 failed)");
});

test("a row names its command, and says what it is doing while it runs", () => {
  const shell = tool({ id: "1", kind: "execute", rawInput: { command: "bun install\n--frozen-lockfile" } });
  assert.equal(`${rowVerb(shell, false)} ${rowSubject(shell)}`, "Ran bun install");
  assert.equal(rowVerb(shell, true), "Running");
  const long = tool({ id: "2", kind: "execute", rawInput: { command: "x".repeat(100) } });
  assert.ok(rowSubject(long).endsWith("…"));
  assert.ok(!runningLabel({ ...long, status: "in_progress" }).endsWith("……"));
});

test("a command line is split into command, flags, strings and operators", () => {
  const tokens = tokenizeCommand(`sed -n 20,30p "docs/LADDER.md" && git status`).filter((token) => token.kind !== "space");
  assert.deepEqual(tokens.map((token) => [token.kind, token.text]), [
    ["command", "sed"],
    ["flag", "-n"],
    ["word", "20,30p"],
    ["string", '"docs/LADDER.md"'],
    ["operator", "&&"],
    ["command", "git"],
    ["word", "status"],
  ]);
  assert.equal(tokenizeCommand("echo 'unterminated").map((token) => token.text).join(""), "echo 'unterminated");
});
