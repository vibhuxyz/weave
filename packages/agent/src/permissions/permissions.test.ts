import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyCommand,
  confineToTaskDir,
  createGuardedPermissionPolicy,
  extractCommand,
  inspectCommandBoundaries,
  toAcpResponse,
  withPolicy,
} from "./index.ts";
import { getEngine, resolveEngineArgs } from "../engines/index.ts";
import { buildMacOsSandboxProfile } from "../spawn/index.ts";
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
  assert.match(sshCheck.reason ?? "", /sensitive/i);

  const awsCheck = inspectCommandBoundaries("cat $HOME/.aws/credentials", FAKE_TASK.cwd);
  assert.equal(awsCheck.allowed, false);

  const gcloudCheck = inspectCommandBoundaries("cat ~/.config/gcloud/credentials.db", FAKE_TASK.cwd);
  assert.equal(gcloudCheck.allowed, false);
});

test("inspectCommandBoundaries rejects path traversal escaping cwd", () => {
  const traversalCheck = inspectCommandBoundaries("cat ../secret.txt", FAKE_TASK.cwd);
  assert.equal(traversalCheck.allowed, false);
  assert.match(traversalCheck.reason ?? "", /traversal/i);

  const upCd = inspectCommandBoundaries("cd ../.. && rm -rf build", FAKE_TASK.cwd);
  assert.equal(upCd.allowed, false);
});

test("inspectCommandBoundaries rejects out-of-tree absolute paths", () => {
  const outOfTree = inspectCommandBoundaries("cat /Users/otheruser/secrets.env", FAKE_TASK.cwd);
  assert.equal(outOfTree.allowed, false);
  assert.match(outOfTree.reason ?? "", /outside task cwd/i);

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

function agyRequest(command: string): RequestPermissionRequest {
  return {
    sessionId: "s1",
    options: [
      { optionId: "agy-allow-once", name: "Yes", kind: "allow_once" },
      {
        optionId: "agy-allow-conversation",
        name: "Yes, and always allow in this conversation",
        kind: "allow_always",
      },
      {
        optionId: "agy-allow-settings",
        name: "Yes, and always allow (Persist to settings.json)",
        kind: "allow_always",
      },
      { optionId: "agy-reject-once", name: "No", kind: "reject_once" },
    ],
    toolCall: {
      toolCallId: "call_1",
      kind: "execute",
      title: "Check node and npm version",
      rawInput: { CommandLine: command, Cwd: FAKE_TASK.cwd },
    },
  };
}

test("extractCommand reads Antigravity's CommandLine key", () => {
  assert.equal(extractCommand({ CommandLine: "node -v" }), "node -v");
  assert.equal(extractCommand({ command: "npm test" }), "npm test");
  assert.equal(extractCommand({ Cwd: "/tmp" }), null);
});

test("allowing picks allow_once, never a persisted always rule", async () => {
  const decision = await confineToTaskDir(FAKE_TASK, agyRequest("node -v && npm -v"));
  assert.equal(decision.decision, "allow");
  if (decision.decision === "allow") {
    assert.equal(decision.optionId, "agy-allow-once");
  }
});

test("rejecting selects the engine's reject option rather than cancelling", async () => {
  const decision = await confineToTaskDir(FAKE_TASK, agyRequest("cat ~/.ssh/id_rsa"));
  assert.equal(decision.decision, "reject");
  assert.deepEqual(toAcpResponse(decision), {
    outcome: { outcome: "selected", optionId: "agy-reject-once" },
  });
});

test("the plan-mode hold still answers cancelled", async () => {
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
      rawInput: { plan: "1. do the thing" },
    },
  };

  const decision = await confineToTaskDir(FAKE_TASK, request);
  assert.deepEqual(toAcpResponse(decision), { outcome: { outcome: "cancelled" } });
});

function executeRequest(command: string): RequestPermissionRequest {
  return {
    sessionId: "s1",
    options: [
      { optionId: "opt-allow", name: "Yes", kind: "allow_once" },
      { optionId: "opt-reject", name: "No", kind: "reject_once" },
    ],
    toolCall: {
      toolCallId: "tc-guarded",
      kind: "execute",
      title: "Terminal",
      rawInput: { command },
    },
  };
}

test("a read-only command is answered without troubling the user", async () => {
  const asked: string[] = [];
  const policy = createGuardedPermissionPolicy(async (_task, _request, command) => {
    asked.push(command ?? "");
    return { decision: "reject", reason: "user said no" };
  });

  const decision = await policy(FAKE_TASK, executeRequest("git status"));
  assert.equal(decision.decision, "allow");
  if (decision.decision === "allow") {
    assert.equal(decision.optionId, "opt-allow");
    assert.match(decision.reason, /read-only git/);
  }
  assert.deepEqual(asked, []);
});

test("a command that can write still goes to the user", async () => {
  const asked: string[] = [];
  const policy = createGuardedPermissionPolicy(async (_task, _request, command) => {
    asked.push(command ?? "");
    return { decision: "allow", optionId: "opt-allow", reason: "user said yes" };
  });

  await policy(FAKE_TASK, executeRequest("rm -rf build"));
  await policy(FAKE_TASK, executeRequest("git push"));
  await policy(FAKE_TASK, executeRequest("grep foo file.txt | sh"));
  assert.deepEqual(asked, ["rm -rf build", "git push", "grep foo file.txt | sh"]);
});

test("the boundary guard still wins over the read-only list", async () => {
  const policy = createGuardedPermissionPolicy(async () => ({
    decision: "allow" as const,
    optionId: "opt-allow",
    reason: "user said yes",
  }));

  const decision = await policy(FAKE_TASK, executeRequest("cat ~/.ssh/id_ed25519"));
  assert.equal(decision.decision, "reject");
});

function planningPolicy(mode: string) {
  const asked: string[] = [];
  const policy = createGuardedPermissionPolicy(
    async (_task, _request, command) => {
      asked.push(command ?? "");
      return { decision: "allow", optionId: "opt-allow", reason: "user said yes" };
    },
    { currentModeId: () => mode },
  );
  return { policy, asked };
}

function toolRequest(
  kind: RequestPermissionRequest["toolCall"]["kind"],
  title: string,
  rawInput: unknown,
  locations?: readonly { path: string }[],
): RequestPermissionRequest {
  return {
    sessionId: "s1",
    options: [
      { optionId: "opt-allow", name: "Yes", kind: "allow_once" },
      { optionId: "opt-reject", name: "No", kind: "reject_once" },
    ],
    toolCall: {
      toolCallId: "tc-plan",
      kind,
      title,
      rawInput,
      ...(locations ? { locations: [...locations] } : {}),
    },
  };
}

test("plan mode refuses to edit a file, without asking the user", async () => {
  const { policy, asked } = planningPolicy("plan");
  const decision = await policy(
    FAKE_TASK,
    toolRequest("edit", "Update packages/logger index.ts", { path: "packages/logger/index.ts" }),
  );
  assert.equal(decision.decision, "reject");
  if (decision.decision === "reject") {
    assert.equal(decision.optionId, "opt-reject");
    assert.match(decision.reason, /plan mode/);
  }
  assert.deepEqual(asked, []);
});

test("plan mode refuses a build or a test run", async () => {
  const { policy } = planningPolicy("plan");
  for (const command of ["bun test", "bun run build", "turbo run check-types"]) {
    const decision = await policy(FAKE_TASK, executeRequest(command));
    assert.equal(decision.decision, "reject", command);
  }
});

test("plan mode still reads the codebase", async () => {
  const { policy, asked } = planningPolicy("plan");
  for (const command of ["grep -rn logger packages", "git status", "find . -type f"]) {
    const decision = await policy(FAKE_TASK, executeRequest(command));
    assert.equal(decision.decision, "allow", command);
  }
  const read = await policy(FAKE_TASK, toolRequest("read", "Read README.md", { path: "README.md" }));
  assert.equal(read.decision, "allow");
  assert.deepEqual(asked, []);
});

test("plan mode lets the agent write the plan itself", async () => {
  const { policy } = planningPolicy("plan");
  const decision = await policy(
    FAKE_TASK,
    toolRequest("edit", "Write plan", { content: "1. step" }, [
      { path: "/Users/xyz/Coding/weave/.claude/plans/refactor.md" },
    ]),
  );
  assert.equal(decision.decision, "allow");
});

test("outside plan mode the same edit is allowed as before", async () => {
  const { policy } = planningPolicy("accept-edits");
  const decision = await policy(
    FAKE_TASK,
    toolRequest("edit", "Update packages/logger index.ts", { path: "packages/logger/index.ts" }),
  );
  assert.equal(decision.decision, "allow");
});

test("a tool that reports no kind is held back while planning", async () => {
  const { policy } = planningPolicy("plan");
  const decision = await policy(FAKE_TASK, toolRequest(undefined, "Do something", {}));
  assert.equal(decision.decision, "reject");
});

test("switching to plan mid-turn stops the next change, not just the next turn", async () => {
  const session = { mode: "accept-edits" };
  const policy = createGuardedPermissionPolicy(
    async () => ({ decision: "allow" as const, optionId: "opt-allow", reason: "user said yes" }),
    { currentModeId: () => session.mode },
  );
  const edit = () =>
    policy(FAKE_TASK, toolRequest("edit", "Update index.ts", { path: "src/index.ts" }));

  assert.equal((await edit()).decision, "allow");
  session.mode = "plan";
  assert.equal((await edit()).decision, "reject");
  session.mode = "accept-edits";
  assert.equal((await edit()).decision, "allow");
});

const AGY_TASK_LOG =
  "/Users/xyz/.gemini/antigravity-cli/brain/859fe3f5-049b-483c-babb-8d822a74ca6b/.system_generated/tasks/task-41.log";

test("an engine may read back the task log it just wrote", () => {
  const check = inspectCommandBoundaries(`cat ${AGY_TASK_LOG}`, FAKE_TASK.cwd);
  assert.equal(check.allowed, true);
});

test("the exception does not open the rest of the engine's home", () => {
  const token = inspectCommandBoundaries(
    "cat /Users/xyz/.gemini/antigravity-cli/antigravity-oauth-token",
    FAKE_TASK.cwd,
  );
  assert.equal(token.allowed, false);

  const settings = inspectCommandBoundaries(
    "cat /Users/xyz/.gemini/antigravity-cli/settings.json",
    FAKE_TASK.cwd,
  );
  assert.equal(settings.allowed, false);

  const sibling = inspectCommandBoundaries(
    "cat /Users/xyz/.gemini/antigravity-cli/brain/abc/.system_generated/tasks/../../secrets.txt",
    FAKE_TASK.cwd,
  );
  assert.equal(sibling.allowed, false);
});

test("reading a task log is a read-only command, so it needs no card", () => {
  assert.equal(classifyCommand(`cat ${AGY_TASK_LOG}`).kind, "read-only");
});

test("withPolicy enforces an employee's deployment, network and git permissions", async () => {
  const commandRequest = (command: string): RequestPermissionRequest => ({
    sessionId: "s1",
    options: [{ optionId: "opt-1", name: "allow", kind: "allow_once" }],
    toolCall: { toolCallId: "tc-1", kind: "execute", title: "Bash", rawInput: { command } },
  });
  const guarded = withPolicy({ deployment: { allowed: false }, network: { allowed: false }, git: { commit: false } }, async () => ({ decision: "allow", optionId: "opt-1", reason: "base" }));
  const reasons = await Promise.all(["vercel deploy --prod", "curl https://example.com", "npm install left-pad", "git commit -m x", "npm test"].map(async (command) => {
    const decision = await guarded(FAKE_TASK, commandRequest(command));
    return decision.decision === "reject" ? decision.reason : "allowed";
  }));
  assert.deepEqual(reasons, [
    "policy: deployment commands disabled for this task",
    "policy: network commands disabled for this task",
    "policy: network commands disabled for this task",
    "policy: git commit disabled for this task",
    "allowed",
  ]);
  const open = withPolicy({ network: { allowed: true } }, async () => ({ decision: "allow", optionId: "opt-1", reason: "base" }));
  assert.equal((await open(FAKE_TASK, commandRequest("curl https://example.com"))).decision, "allow");
});
