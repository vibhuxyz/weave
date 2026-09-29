import test from "node:test";
import assert from "node:assert/strict";
import { resolveParentPaths, splitShellWords, type DirectoryView } from "./index.ts";

const ROOT = "/p";
const EXISTING = new Set([ROOT, "/p/src", "/p/src/api", "/p/src/ui"]);
const view = (links: ReadonlyMap<string, string> = new Map()): DirectoryView => ({
  isDirectory: (path) => EXISTING.has(path),
  realPath: (path) => links.get(path) ?? path,
});
const resolved = (command: string, links?: ReadonlyMap<string, string>) =>
  resolveParentPaths(command, ROOT, view(links)).map((use) => use.resolved);

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

test("quotes inside a command substitution do not end the outer quotes", () => {
  assert.deepEqual(splitShellWords(`echo "count: $(find "/a/full stack/x" -name '*.node' | wc -l)"`), [
    "echo", `count: $(find "/a/full stack/x" -name '*.node' | wc -l)`,
  ]);
});

test("an unbalanced quote keeps the rest of the command in the last word", () => {
  assert.deepEqual(splitShellWords(`cat "/a/b c`), ["cat", "/a/b c"]);
});

test("a parent path resolves from the directory an earlier cd moved to", () => {
  assert.deepEqual(resolved("cd src/api && npm test && cd ../ui && ls ../api"), ["/p/src/ui", "/p/src/api"]);
  assert.deepEqual(resolved("cd /p/src/api && npm run typecheck 2>&1 | tail -30; cd ../ui && npm run build"), ["/p/src/ui"]);
});

test("a cd that may not have happened leaves the directory unknown", () => {
  assert.deepEqual(resolved("cd src/missing; cat ../x"), [null]);
  assert.deepEqual(resolved("false && cd src/api; cat ../x"), [null]);
  assert.deepEqual(resolved("cd src/api || exit 1; cat ../x"), [null]);
  assert.deepEqual(resolved("cd src/api && npm test & cat ../x"), [null]);
  assert.deepEqual(resolved("(cd src/api); cat ../x"), [null]);
  assert.deepEqual(resolved("ls | cd src/api && cat ../x"), [null]);
});

test("a cd inside an and-chain holds only for that chain", () => {
  assert.deepEqual(resolved("cd src/missing && cat ../x"), ["/p/src/x"]);
  assert.deepEqual(resolved("cd src/missing && cat ../x; cat ../y"), ["/p/src/x", null]);
});

test("parent segments are resolved through symlinks, the way the kernel does", () => {
  const links = new Map([["/p/link", "/elsewhere/deep"]]);
  assert.deepEqual(resolved("cd link && cat ../x", links), ["/elsewhere/x"]);
});

test("parent paths are found after = and inside command substitutions", () => {
  assert.deepEqual(resolved(`tsc --outDir=../dist; echo "$(cat ../../x)"`), ["/dist", "/p/x", "/x"]);
});
