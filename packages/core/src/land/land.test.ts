import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskContract } from "@weave/protocol";
import { Coordinator } from "../coordination/index.ts";
import { integrate } from "../integrator/index.ts";
import type { VerifyWorkspace } from "../integrator/index.ts";
import { runPool, type RunWorker } from "../pool/index.ts";
import { Ledger } from "../shared/index.ts";
import { WorkspaceManager } from "../workspace-manager/index.ts";
import { outputLines, runGit } from "../worktree/index.ts";
import { commitProject, landIntegration } from "./land.ts";

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "weave-land-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "src", "shared.ts"), "export const shared = 0;\n");
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  return repo;
}

const alwaysOk: VerifyWorkspace = async () => ({ ok: true, rungs: ["build"], detail: "ok" });

function task(id: string, path: string): TaskContract {
  return { id, prompt: `write ${path}`, cwd: "", allowedPaths: [path] };
}

async function runFeature(
  repo: string,
  writes: Readonly<Record<string, readonly [string, string]>>,
  forceIsolation = false,
) {
  const weaveDir = join(repo, ".weave");
  const ledger = new Ledger(weaveDir, "run1");
  const base = (await runGit(repo, ["rev-parse", "HEAD"])).output.trim();
  const tasks = Object.entries(writes).map(([id, [path]]) => task(id, path));
  const coordinator = new Coordinator({ tasks, ledger });
  if (forceIsolation) {
    coordinator.tryClaim({ id: "reserved", prompt: "", cwd: "", allowedPaths: ["src/**"] });
  }

  const worker: RunWorker = async ({ task: running }) => {
    const entry = writes[running.id];
    if (!entry) return { status: "failed", error: "no work" };
    await mkdir(join(running.cwd, entry[0], ".."), { recursive: true });
    await writeFile(join(running.cwd, entry[0]), entry[1]);
    return { status: "ok" };
  };

  const pooled = await runPool({
    repoRoot: repo,
    weaveDir,
    ledger,
    tasks,
    concurrency: 3,
    runWorker: worker,
    shouldInstall: false,
    baseCommit: base,
    coordinator,
  });
  const candidates = pooled.tasks.map((entry) => ({
    taskId: entry.taskId,
    branch: entry.branch ?? "",
    commit: entry.harvest?.commit ?? null,
  }));
  const integration = await integrate({
    repoRoot: repo,
    weaveDir,
    ledger,
    baseCommit: base,
    candidates,
    verify: alwaysOk,
    shouldInstall: false,
  });
  return { base, pooled, integration };
}

test("a multi-worker feature lands on the run branch and reaches the actual project", async () => {
  const repo = await makeRepo();
  const manager = new WorkspaceManager({ repoRoot: repo, runId: "123" });
  assert.ok((await manager.open()).ok);

  const { integration } = await runFeature(
    repo,
    {
      T1: ["src/backend.ts", "export const backend = 1;\n"],
      T2: ["src/frontend.ts", "export const frontend = 1;\n"],
      T3: ["src/tests.ts", "export const tests = 1;\n"],
    },
    true,
  );

  assert.equal(integration.status, "ok");
  assert.ok(integration.branch);
  assert.ok(integration.head);

  const landed = await landIntegration({
    repoRoot: repo,
    runBranch: "weave/run-123",
    integrationRef: integration.branch,
  });
  assert.ok(landed.ok, landed.ok ? "" : landed.reason);
  assert.equal(landed.landed.branch, "weave/run-123");
  assert.equal(landed.landed.head, integration.head);
  assert.equal(landed.landed.checkedOut, true);

  const branch = (await runGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"])).output.trim();
  assert.equal(branch, "weave/run-123", "the project must be checked out on the run branch");

  for (const file of ["src/backend.ts", "src/frontend.ts", "src/tests.ts"]) {
    assert.match(await readFile(join(repo, file), "utf8"), /export const/, `${file} must exist in the project`);
  }

  const diff = await runGit(repo, ["diff", "--name-only", "main", "weave/run-123"]);
  assert.deepEqual([...outputLines(diff.output)].sort(), ["src/backend.ts", "src/frontend.ts", "src/tests.ts"]);
  assert.deepEqual([...landed.landed.changedFiles].sort(), ["src/backend.ts", "src/frontend.ts", "src/tests.ts"]);

  const log = await runGit(repo, ["log", "--oneline", "main..weave/run-123"]);
  assert.ok(outputLines(log.output).length > 0, "git log must show the run's commits");
});

test("a conflict fails the integration, names the task, and leaves the project untouched", async () => {
  const repo = await makeRepo();
  const manager = new WorkspaceManager({ repoRoot: repo, runId: "conflict" });
  assert.ok((await manager.open()).ok);
  const beforeHead = (await runGit(repo, ["rev-parse", "HEAD"])).output.trim();

  const { integration } = await runFeature(
    repo,
    {
      T1: ["src/shared.ts", "export const shared = 1;\n"],
      T2: ["src/shared.ts", "export const shared = 2;\n"],
    },
    true,
  );

  assert.equal(integration.status, "failed");
  assert.ok(integration.brokenBy, "the integration must name the task that broke it");
  assert.match(integration.detail, /conflict|already/i);

  const conflicted = integration.merges.find((merge) => merge.status === "conflict" || merge.status === "not-run");
  assert.ok(conflicted, "a conflicting merge must be reported, not silently dropped");

  const head = (await runGit(repo, ["rev-parse", "HEAD"])).output.trim();
  assert.equal(head, beforeHead, "a failed integration must not move the project");
  assert.match(await readFile(join(repo, "src", "shared.ts"), "utf8"), /shared = 0/);

  const branches = await runGit(repo, ["branch", "--list", "weave/run1/*"]);
  assert.ok(outputLines(branches.output).length > 0, "the workers' branches must survive so no work is lost");
});

test("landing refuses to overwrite uncommitted work in the project", async () => {
  const repo = await makeRepo();
  const manager = new WorkspaceManager({ repoRoot: repo, runId: "dirty" });
  assert.ok((await manager.open()).ok);
  const { integration } = await runFeature(repo, { T1: ["src/backend.ts", "export const backend = 1;\n"] }, true);
  assert.equal(integration.status, "ok");

  await writeFile(join(repo, "src", "shared.ts"), "export const shared = 99;\n");
  const refused = await landIntegration({
    repoRoot: repo,
    runBranch: "weave/run-dirty",
    integrationRef: integration.branch ?? "",
  });
  assert.ok(!refused.ok);
  assert.match(refused.reason, /uncommitted changes/);
  assert.match(await readFile(join(repo, "src", "shared.ts"), "utf8"), /shared = 99/, "the user's edit must survive");

  const landed = await landIntegration({
    repoRoot: repo,
    runBranch: "weave/run-elsewhere",
    integrationRef: integration.branch ?? "",
    checkout: false,
  });
  assert.ok(landed.ok, landed.ok ? "" : landed.reason);
  assert.equal(landed.landed.checkedOut, false);
  assert.equal((await runGit(repo, ["rev-parse", "weave/run-elsewhere"])).output.trim(), integration.head);
  assert.match(await readFile(join(repo, "src", "shared.ts"), "utf8"), /shared = 99/, "landing without checkout must not touch the tree");
});

test("landing refuses to move a branch that is not a weave run branch", async () => {
  const repo = await makeRepo();
  const refused = await landIntegration({ repoRoot: repo, runBranch: "main", integrationRef: "HEAD" });
  assert.ok(!refused.ok);
  assert.match(refused.reason, /must start with "weave\//);
});

test("a shared-workspace run is committed onto the run branch and shows up in git diff", async () => {
  const repo = await makeRepo();
  const manager = new WorkspaceManager({ repoRoot: repo, runId: "shared" });
  assert.ok((await manager.open()).ok);

  const weaveDir = join(repo, ".weave");
  const ledger = new Ledger(weaveDir, "run1");
  const tasks = [task("T1", "src/backend.ts"), task("T2", "src/frontend.ts")];
  const worker: RunWorker = async ({ task: running }) => {
    const name = running.allowedPaths?.[0] ?? "src/x.ts";
    await writeFile(join(running.cwd, name), `export const ${running.id} = 1;\n`);
    return { status: "ok" };
  };
  const pooled = await runPool({ repoRoot: repo, weaveDir, ledger, tasks, concurrency: 2, runWorker: worker, shouldInstall: false });
  assert.deepEqual(pooled.tasks.map((entry) => entry.status), ["ok", "ok"]);
  assert.deepEqual(pooled.tasks.map((entry) => entry.branch), [null, null], "disjoint tasks share the project directory");

  const committed = await commitProject({ repoRoot: repo, runBranch: "weave/run-shared", message: "weave: add backend and frontend" });
  assert.ok(committed.ok, committed.ok ? "" : committed.reason);
  assert.ok(committed.committed.commit);
  assert.deepEqual([...committed.committed.changedFiles].sort(), ["src/backend.ts", "src/frontend.ts"]);

  const diff = await runGit(repo, ["diff", "--name-only", "main", "weave/run-shared"]);
  assert.deepEqual([...outputLines(diff.output)].sort(), ["src/backend.ts", "src/frontend.ts"]);
  const log = await runGit(repo, ["log", "--oneline", "-1", "weave/run-shared"]);
  assert.match(log.output, /add backend and frontend/);

  const clean = await commitProject({ repoRoot: repo, runBranch: "weave/run-shared", message: "weave: nothing left" });
  assert.ok(clean.ok);
  assert.equal(clean.committed.commit, null, "a clean tree must not create an empty commit");
});

test("committing a run refuses a branch that is not the checked out run branch", async () => {
  const repo = await makeRepo();
  const refused = await commitProject({ repoRoot: repo, runBranch: "weave/run-elsewhere", message: "weave: nope" });
  assert.ok(!refused.ok);
  assert.match(refused.reason, /is on main, not weave\/run-elsewhere/);
});
