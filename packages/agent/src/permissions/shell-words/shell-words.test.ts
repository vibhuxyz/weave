import test from "node:test";
import assert from "node:assert/strict";
import { splitShellWords } from "./index.ts";

test("quoted and escaped spaces stay inside one word", () => {
  assert.deepEqual(splitShellWords(`cd "/a/full stack/src" && ls '/a/b c' /a/d\\ e`), [
    "cd", "/a/full stack/src", "ls", "/a/b c", "/a/d e",
  ]);
});

test("adjacent quoted and bare text join into one word", () => {
  assert.deepEqual(splitShellWords(`cat "/a/full stack"-secrets/key`), ["cat", "/a/full stack-secrets/key"]);
});

test("pipes, redirects, chains and subshells separate words", () => {
  assert.deepEqual(splitShellWords("npm install 2>&1 | tail -40;(echo x)"), [
    "npm", "install", "2", "1", "tail", "-40", "echo", "x",
  ]);
});

test("double quotes unescape only what the shell unescapes", () => {
  assert.deepEqual(splitShellWords(String.raw`echo "a\"b" "c\d" 'e\f'`), ["echo", `a"b`, String.raw`c\d`, String.raw`e\f`]);
});

test("an unbalanced quote keeps the rest of the command in the last word", () => {
  assert.deepEqual(splitShellWords(`cat "/a/b c`), ["cat", "/a/b c"]);
});
