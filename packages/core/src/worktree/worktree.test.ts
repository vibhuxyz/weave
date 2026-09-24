import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCleanBase } from "./preflight.ts";
import { harvestWorktree } from "./harvest.ts";
import { detectInstallCommand, installWorktree } from "./install.ts";
import { runGit } from "./run-git.ts";
import { createWorktree, listWeaveWorktrees, removeWorktree } from "./worktree.ts";

async function git(cwd: string, ...args: string[]): Promise<string> {
  const run = await runGit(cwd, args);
  assert.ok(run.ok, run.output);
  return run.output.trim();
}

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "weave-worktree-"));
  await git(repo, "init", "--quiet", "--initial-branch=main");
  await writeFile(join(repo, "README.md"), "hello\n");
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  await git(repo, "add", "-A");
  await git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init");
  return repo;
}

test("a dirty main is refused with the files named, and a clean one returns HEAD", async () => {
  const repo = await makeRepo();
  const head = await git(repo, "rev-parse", "HEAD");
  assert.deepEqual(await checkCleanBase(repo), { ok: true, value: head });
  await writeFile(join(repo, "README.md"), "changed\n");
  const dirty = await checkCleanBase(repo);
  assert.equal(dirty.ok, false);
  assert.match(dirty.ok ? "" : dirty.reason, /1 uncommitted change\(s\): M README\.md/);
});

test("two runs with the same task id get separate branches and folders", async () => {
  const repo = await makeRepo();
  const weaveDir = join(repo, ".weave");
  const first = await createWorktree({ repoRoot: repo, weaveDir, taskId: "T1", runId: "run-a" });
  const second = await createWorktree({ repoRoot: repo, weaveDir, taskId: "T1", runId: "run-b" });
  assert.notEqual(first.branch, second.branch);
  assert.notEqual(first.path, second.path);
  const listed = await listWeaveWorktrees(repo);
  assert.deepEqual(listed.map((worktree) => [worktree.taskId, worktree.branch]).sort(), [
    ["T1", "weave/run-a/T1"],
    ["T1", "weave/run-b/T1"],
  ]);
});

test("unsafe task ids are rejected before touching git", async () => {
  const repo = await makeRepo();
  await assert.rejects(
    createWorktree({ repoRoot: repo, weaveDir: join(repo, ".weave"), taskId: "../escape" }),
    /task id "..\/escape" must be/,
  );
});

test("harvest commits the worker's files, skips node_modules, and lists what changed", async () => {
  const repo = await makeRepo();
  const worktree = await createWorktree({ repoRoot: repo, weaveDir: join(repo, ".weave"), taskId: "T1", runId: "r" });
  assert.deepEqual(await harvestWorktree(worktree, "T1"), { ok: true, value: { commit: null, files: [] } });
  await writeFile(join(worktree.path, "a.txt"), "a\n");
  await writeFile(join(worktree.path, "README.md"), "edited\n");
  await mkdir(join(worktree.path, "node_modules", "left-pad"), { recursive: true });
  await writeFile(join(worktree.path, "node_modules", "left-pad", "index.js"), "module.exports = 1;\n");
  await mkdir(join(worktree.path, "pkg", "node_modules"), { recursive: true });
  await writeFile(join(worktree.path, "pkg", "node_modules", "dep.js"), "");
  const harvest = await harvestWorktree(worktree, "T1");
  assert.ok(harvest.ok);
  assert.deepEqual(harvest.value.files, ["README.md", "a.txt"]);
  assert.equal(await git(repo, "rev-parse", worktree.branch), harvest.value.commit);
});

test("remove works on a locked worktree and prunes it", async () => {
  const repo = await makeRepo();
  const worktree = await createWorktree({ repoRoot: repo, weaveDir: join(repo, ".weave"), taskId: "T1", runId: "r" });
  await git(repo, "worktree", "lock", worktree.path);
  await removeWorktree(repo, worktree, { deleteBranch: true });
  assert.deepEqual(await listWeaveWorktrees(repo), []);
  assert.equal((await runGit(repo, ["rev-parse", "--verify", worktree.branch])).ok, false);
});

test("the install command follows the lockfile, and no package.json means skip", async () => {
  assert.equal(detectInstallCommand(new Set(["package.json", "bun.lock"])), "bun install --frozen-lockfile");
  assert.equal(detectInstallCommand(new Set(["package.json", "package-lock.json"])), "npm ci --no-audit --no-fund");
  assert.equal(detectInstallCommand(new Set(["package.json"])), "npm install --no-audit --no-fund --no-package-lock");
  const repo = await makeRepo();
  assert.deepEqual(await installWorktree(repo), { status: "skipped", reason: "no package.json in the worktree root" });
});

test("installing a repo without a lockfile leaves the worktree clean", async () => {
  const repo = await makeRepo();
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "demo", version: "1.0.0" }));
  await git(repo, "add", "-A");
  await git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "pkg");
  const worktree = await createWorktree({ repoRoot: repo, weaveDir: join(repo, ".weave"), taskId: "T1", runId: "r" });
  const installed = await installWorktree(worktree.path);
  assert.equal(installed.status, "ok", installed.status === "skipped" ? installed.reason : installed.outputTail);
  assert.deepEqual(await harvestWorktree(worktree, "T1"), { ok: true, value: { commit: null, files: [] } });
});

test("an install that changes files fails the install step, not the worker", async () => {
  const repo = await makeRepo();
  const scripts = { preinstall: "node -e \"require('fs').writeFileSync('generated.txt','x')\"" };
  await writeFile(join(repo, "package.json"), JSON.stringify({ name: "demo", version: "1.0.0", scripts }));
  await git(repo, "add", "-A");
  await git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "pkg");
  const worktree = await createWorktree({ repoRoot: repo, weaveDir: join(repo, ".weave"), taskId: "T1", runId: "r" });
  const installed = await installWorktree(worktree.path);
  assert.equal(installed.status, "failed");
  assert.match(installed.status === "failed" ? installed.outputTail : "", /install changed files in the worktree \(\?\? generated\.txt\)/);
});
