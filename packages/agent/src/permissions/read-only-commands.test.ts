import test from "node:test";
import assert from "node:assert/strict";
import { classifyCommand } from "./read-only-commands.ts";

function isReadOnly(command: string): boolean {
  return classifyCommand(command).kind === "read-only";
}

function reason(command: string): string {
  const classified = classifyCommand(command);
  return classified.kind === "ask" ? classified.reason : "read-only";
}

test("the commands that raised a card are answered without one", () => {
  assert.ok(isReadOnly("grep -E '^## Decision |^## Open' docs/DECISIONS.md"));
  assert.ok(
    isReadOnly(
      "find packages/logger packages/auth apps/api/src apps/web/src/features/auth -type f",
    ),
  );
});

test("a pipe inside quotes is text, not a pipeline", () => {
  assert.ok(isReadOnly("grep -E 'a|b' file.txt"));
  assert.ok(isReadOnly('grep "one|two" file.txt'));
});

test("a real pipeline is left to the user", () => {
  assert.equal(isReadOnly("grep foo file.txt | sh"), false);
  assert.equal(isReadOnly("cat a.txt > b.txt"), false);
  assert.equal(isReadOnly("ls; rm -rf build"), false);
  assert.equal(isReadOnly("ls && npm publish"), false);
});

test("command substitution is left to the user however it is quoted", () => {
  assert.equal(isReadOnly("cat $(which node)"), false);
  assert.equal(isReadOnly("cat `which node`"), false);
  assert.equal(isReadOnly('grep "$(cat /etc/passwd)" file'), false);
  assert.equal(isReadOnly("ls ${HOME}"), false);
});

test("single quotes keep an expansion literal", () => {
  assert.ok(isReadOnly("grep '$HOME' notes.txt"));
});

test("find that deletes or runs a program is left to the user", () => {
  assert.equal(isReadOnly("find . -name '*.log' -delete"), false);
  assert.equal(isReadOnly("find . -type f -exec rm {} ;"), false);
  assert.equal(isReadOnly("find . -fprintf out.txt '%p'"), false);
  assert.match(reason("find . -delete"), /can change files/);
});

test("find that only lists is answered", () => {
  assert.ok(isReadOnly("find . -type f -name '*.ts'"));
  assert.ok(isReadOnly("find src -maxdepth 2 -printf '%p'"));
});

test("only read-only git subcommands are answered", () => {
  assert.ok(isReadOnly("git status"));
  assert.ok(isReadOnly("git log --oneline -20"));
  assert.ok(isReadOnly("git diff HEAD~1"));
  assert.equal(isReadOnly("git push"), false);
  assert.equal(isReadOnly("git commit -m wip"), false);
  assert.equal(isReadOnly("git checkout main"), false);
  assert.equal(isReadOnly("git branch -D main"), false);
  assert.equal(isReadOnly("git diff --output=patch.txt"), false);
  assert.equal(isReadOnly("git -C /elsewhere log"), false);
  assert.equal(isReadOnly("git"), false);
});

test("a command that never finishes is left to the user", () => {
  assert.equal(isReadOnly("tail -f server.log"), false);
  assert.ok(isReadOnly("tail -n 50 server.log"));
});

test("anything not on the list is left to the user", () => {
  assert.equal(isReadOnly("rm -rf build"), false);
  assert.equal(isReadOnly("npm install"), false);
  assert.equal(isReadOnly("node script.js"), false);
  assert.equal(isReadOnly("sudo ls"), false);
  assert.equal(isReadOnly("curl https://example.com"), false);
  assert.match(reason("npm install"), /npm is not a read-only command/);
});

test("a read-only name given by path is not trusted", () => {
  assert.equal(isReadOnly("/bin/ls"), false);
  assert.equal(isReadOnly("./ls"), false);
  assert.match(reason("/bin/ls"), /names a program by path/);
});

test("an environment prefix is not mistaken for the command", () => {
  assert.equal(isReadOnly("LD_PRELOAD=evil.so ls"), false);
});

test("an unbalanced quote is left to the user rather than guessed at", () => {
  assert.equal(isReadOnly("grep 'unterminated file.txt"), false);
  assert.match(reason("grep 'unterminated"), /unbalanced quote/);
});

test("a newline cannot smuggle a second command in", () => {
  assert.equal(isReadOnly("ls\nrm -rf build"), false);
});

test("an escaped separator stays part of the word", () => {
  assert.ok(isReadOnly("cat my\\ file.txt"));
});

test("an empty or oversized command is left to the user", () => {
  assert.equal(isReadOnly(""), false);
  assert.equal(isReadOnly("   "), false);
  assert.equal(isReadOnly(`grep x ${"a".repeat(5000)}`), false);
});

test("brace expansion in a grep is words, not a command chain", () => {
  assert.ok(
    isReadOnly(
      'grep -rn --exclude-dir={node_modules,ref-ai,.git,dist,.turbo} "Clean foundational contract" .',
    ),
  );
  assert.ok(isReadOnly("cat packages/{logger,auth}/package.json"));
});

test("a brace group that hides a second command is still refused", () => {
  assert.equal(isReadOnly("{ ls; rm -rf build; }"), false);
  assert.equal(isReadOnly("{ ls && npm publish; }"), false);
  assert.equal(isReadOnly("cat ${HOME}/.ssh/id_rsa"), false);
});
