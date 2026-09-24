import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskContract } from "@weave/protocol";
import { runPool, type RunWorker } from "../pool/index.ts";
import { Ledger } from "../shared/index.ts";
import { listWeaveWorktrees, runGit } from "../worktree/index.ts";
import { integrate } from "./integrator.ts";
import type { VerifyWorkspace } from "./types.ts";

async function makeRepo(): Promise<{ repo: string; base: string }> {
  const repo = await mkdtemp(join(tmpdir(), "weave-integrate-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  await writeFile(join(repo, "shared.txt"), "original\n");
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  return { repo, base: (await runGit(repo, ["rev-parse", "HEAD"])).output.trim() };
}

const writes = (files: Readonly<Record<string, Record<string, string>>>): RunWorker => async ({ task }) => {
  for (const [name, content] of Object.entries(files[task.id] ?? {})) await writeFile(join(task.cwd, name), content);
  return { status: "ok" };
};

const exists = (path: string) => access(path).then(() => true, () => false);
const alwaysOk: VerifyWorkspace = async () => ({ ok: true, rungs: ["build"], detail: "ok" });

async function runAndIntegrate(files: Readonly<Record<string, Record<string, string>>>, verify: VerifyWorkspace) {
  const { repo, base } = await makeRepo();
  const weaveDir = join(repo, ".weave");
  const ledger = new Ledger(weaveDir, "run1");
  const tasks: TaskContract[] = Object.keys(files).map((id) => ({ id, prompt: id, cwd: repo }));
  const pooled = await runPool({ tasks, repoRoot: repo, weaveDir, ledger, concurrency: 3, runWorker: writes(files), shouldInstall: false });
  const candidates = pooled.tasks.map((entry) => ({ taskId: entry.taskId, branch: entry.branch ?? "", commit: entry.harvest?.commit ?? null }));
  const integration = await integrate({ repoRoot: repo, weaveDir, ledger, baseCommit: base, candidates, verify, shouldInstall: false });
  return { repo, base, integration };
}

test("disjoint tasks merge one by one, verified after each, onto an integration branch", async () => {
  const calls: string[] = [];
  const recording: VerifyWorkspace = async (cwd) => {
    calls.push((await Promise.all(["T1.txt", "T2.txt", "T3.txt"].map((name) => exists(join(cwd, name))))).map(Number).join(""));
    return { ok: true, rungs: ["build"], detail: "ok" };
  };
  const { repo, base, integration } = await runAndIntegrate({ T1: { "T1.txt": "1" }, T2: { "T2.txt": "2" }, T3: { "T3.txt": "3" } }, recording);
  assert.equal(integration.status, "ok");
  assert.deepEqual(integration.merges.map((merge) => merge.status), ["merged", "merged", "merged"]);
  assert.deepEqual(calls, ["000", "100", "110", "111"]);
  const tree = await runGit(repo, ["ls-tree", "--name-only", integration.branch ?? "", "--"]);
  assert.deepEqual(tree.output.trim().split("\n").sort(), [".gitignore", "T1.txt", "T2.txt", "T3.txt", "shared.txt"]);
  assert.deepEqual(await listWeaveWorktrees(repo), []);
  assert.equal((await runGit(repo, ["rev-parse", "main"])).output.trim(), base);
});

test("a conflict stops the integration and names the task that caused it", async () => {
  const { integration } = await runAndIntegrate(
    { T1: { "shared.txt": "from T1\n" }, T2: { "shared.txt": "from T2\n" }, T3: { "T3.txt": "3" } },
    alwaysOk,
  );
  assert.equal(integration.status, "failed");
  assert.equal(integration.brokenBy, "T2");
  assert.deepEqual(integration.merges.map((merge) => [merge.taskId, merge.status]), [
    ["T1", "merged"],
    ["T2", "conflict"],
    ["T3", "not-run"],
  ]);
  assert.equal(integration.merges[1]?.detail, "conflicts with earlier merges in shared.txt");
});

test("a verification failure after a merge names that task", async () => {
  const failsWithT2: VerifyWorkspace = async (cwd) =>
    (await exists(join(cwd, "T2.txt"))) ? { ok: false, rungs: ["tests"], detail: "1 failed" } : { ok: true, rungs: ["tests"], detail: "ok" };
  const { integration } = await runAndIntegrate({ T1: { "T1.txt": "1" }, T2: { "T2.txt": "2" }, T3: { "T3.txt": "3" } }, failsWithT2);
  assert.equal(integration.brokenBy, "T2");
  assert.equal(integration.detail, "T2: 1 failed");
  assert.deepEqual(integration.merges.map((merge) => merge.status), ["merged", "verify-failed", "not-run"]);
});

test("when the base already fails verification, merges still run but nothing is blamed", async () => {
  const neverOk: VerifyWorkspace = async () => ({ ok: false, rungs: [], detail: "no rung" });
  const { integration } = await runAndIntegrate({ T1: { "T1.txt": "1" }, T2: {} }, neverOk);
  assert.equal(integration.status, "unverified");
  assert.equal(integration.brokenBy, null);
  assert.deepEqual(integration.merges.map((merge) => merge.status), ["merged", "empty"]);
});
