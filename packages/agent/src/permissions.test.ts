import test from "node:test";
import assert from "node:assert/strict";
import {
  confineToTaskDir,
  extractCommand,
  inspectCommandBoundaries,
} from "./permissions.ts";
import { getEngine, resolveEngineArgs } from "./engines.ts";
import { buildMacOsSandboxProfile } from "./spawn.ts";
import type { TaskContract, RequestPermissionRequest } from "@weave/protocol";

const FAKE_TASK: TaskContract = {
  id: "test-task",
  prompt: "run tests",
  cwd: "/Users/xyz/Coding/weave",
};

test("inspectCommandBoundaries allows safe in-tree commands", () => {
  assert.equal(inspectCommandBoundaries("npm test", FAKE_TASK.cwd).allowed, true);
  assert.equal(inspectCommandBoundaries("git status", FAKE_TASK.cwd).allowed, true);
  assert.equal(inspectCommandBoundaries("node src/index.ts", FAKE_TASK.cwd).allowed, true);
  assert.equal(inspectCommandBoundaries("git log HEAD..main", FAKE_TASK.cwd).allowed, true);
});

test("inspectCommandBoundaries rejects sensitive credential access", () => {
  const sshCheck = inspectCommandBoundaries("cat ~/.ssh/id_rsa", FAKE_TASK.cwd);
  assert.equal(sshCheck.allowed, false);
  assert.match(sshCheck.reason!, /sensitive/i);

  const awsCheck = inspectCommandBoundaries("cat $HOME/.aws/credentials", FAKE_TASK.cwd);
  assert.equal(awsCheck.allowed, false);

  const gcloudCheck = inspectCommandBoundaries("cat ~/.config/gcloud/credentials.db", FAKE_TASK.cwd);
  assert.equal(gcloudCheck.allowed, false);
});

test("inspectCommandBoundaries rejects path traversal escaping cwd", () => {
  const traversalCheck = inspectCommandBoundaries("cat ../secret.txt", FAKE_TASK.cwd);
  assert.equal(traversalCheck.allowed, false);
  assert.match(traversalCheck.reason!, /traversal/i);

  const upCd = inspectCommandBoundaries("cd ../.. && rm -rf build", FAKE_TASK.cwd);
  assert.equal(upCd.allowed, false);
});

test("inspectCommandBoundaries rejects out-of-tree absolute paths", () => {
  const outOfTree = inspectCommandBoundaries("cat /Users/otheruser/secrets.env", FAKE_TASK.cwd);
  assert.equal(outOfTree.allowed, false);
  assert.match(outOfTree.reason!, /outside task cwd/i);

  const inTree = inspectCommandBoundaries(`cat ${FAKE_TASK.cwd}/README.md`, FAKE_TASK.cwd);
  assert.equal(inTree.allowed, true);
});

test("confineToTaskDir rejects command attempting escape", async () => {
  const request: RequestPermissionRequest = {
    sessionId: "s1",
    options: [
      { optionId: "opt-1", name: "allow", kind: "allow_once" },
      { optionId: "opt-2", name: "reject", kind: "reject_once" },
    ],
    toolCall: {
      toolCallId: "tc-1",
      kind: "execute",
      title: "Bash",
      rawInput: { command: "cat ~/.ssh/id_ed25519" },
    },
  };

  const decision = await confineToTaskDir(FAKE_TASK, request);
  assert.equal(decision.decision, "reject");
  if (decision.decision === "reject") {
    assert.match(decision.reason, /command rejected/i);
  }
});

test("confineToTaskDir holds ExitPlanMode for user review", async () => {
  const request: RequestPermissionRequest = {
    sessionId: "s1",
    options: [
      { optionId: "opt-1", name: "Yes", kind: "allow_once" },
      { optionId: "opt-2", name: "No", kind: "reject_once" },
    ],
    toolCall: {
      toolCallId: "tc-exitplanmode-1",
      kind: "other",
      title: "Exit plan mode",
      rawInput: { plan: "1. do the thing\n2. verify" },
    },
  };

  const decision = await confineToTaskDir(FAKE_TASK, request);
  assert.equal(decision.decision, "reject");
  if (decision.decision === "reject") {
    assert.match(decision.reason, /user review/i);
  }
});

test("resolveEngineArgs handles Antigravity sandboxed toggle", () => {
  const agy = getEngine("antigravity");

  const unconstrainedArgs = resolveEngineArgs(agy, { sandboxed: false });
  assert.equal(unconstrainedArgs.includes("--no-sandbox"), true);

  const sandboxedArgs = resolveEngineArgs(agy, { sandboxed: true });
  assert.equal(sandboxedArgs.includes("--no-sandbox"), false);
});

test("buildMacOsSandboxProfile constructs valid SBPL with cwd and denials", () => {
  const profile = buildMacOsSandboxProfile(FAKE_TASK.cwd);
  assert.match(profile, /\(version 1\)/);
  assert.match(profile, /\(allow default\)/);
  assert.match(profile, /\(deny file-write\*\)/);
  assert.match(profile, new RegExp(FAKE_TASK.cwd));
  assert.match(profile, /\.ssh/);
  assert.match(profile, /\.aws/);
});
