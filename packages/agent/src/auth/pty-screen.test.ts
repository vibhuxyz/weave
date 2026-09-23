import test from "node:test";
import assert from "node:assert/strict";
import { mergeScreenLines, toScreenLines } from "./pty-screen.ts";
import { terminalQueryReplies } from "./terminal-replies.ts";

test("toScreenLines strips styling, spinners and cursor moves", () => {
  const raw = "\x1B[H\x1B[2J ⣾ \x1B[38;2;66;133;244mSigning in...\x1B[m\r\n\x1B[6Ghttps://accounts.google.com/o?a=1&b=2\r\n\r\n";
  assert.deepEqual(toScreenLines(raw), ["Signing in...", "https://accounts.google.com/o?a=1&b=2"]);
});

test("mergeScreenLines keeps first appearance order and a line cap", () => {
  assert.deepEqual(mergeScreenLines(["a", "b"], ["b", "c", "a", "d"], 3), ["b", "c", "d"]);
});

test("terminalQueryReplies answers mode, attribute and color queries", () => {
  const replies = terminalQueryReplies("\x1B[?2026$p\x1B[?2027$p\x1B[c\x1B[?u\x1B]11;?\x07");
  assert.deepEqual(replies, [
    "\x1B[?2026;2$y",
    "\x1B[?2027;2$y",
    "\x1B[?62;22c",
    "\x1B[?0u",
    "\x1B]11;rgb:0000/0000/0000\x1B\\",
  ]);
});

test("terminalQueryReplies ignores plain output", () => {
  assert.deepEqual(terminalQueryReplies("Welcome to the Antigravity CLI"), []);
});
