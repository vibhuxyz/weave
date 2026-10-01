import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskContract } from "@weave/protocol";
import type { RunWorker } from "../pool/index.ts";
import { runGit } from "../worktree/index.ts";
import { runPlan } from "./run-plan.ts";

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "weave-runplan-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\nnode_modules\n");
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  return repo;
}

const writesApp: RunWorker = async ({ task }) => {
  await writeFile(join(task.cwd, "index.html"), "<!doctype html>\n");
  return { status: "ok" };
};

test("a single task that succeeds in a project with no checks makes the run unverified, not failed", async () => {
  const repo = await makeRepo();
  const tasks: TaskContract[] = [{ id: "T1", prompt: "build the app", cwd: repo, allowedPaths: ["index.html"] }];

  const result = await runPlan({ repoRoot: repo, tasks, concurrency: 1, runWorker: writesApp, shouldInstall: false });

  assert.ok(result.ok, result.ok ? "" : result.reason);
  assert.deepEqual(result.value.pool.tasks.map((entry) => entry.status), ["ok"]);
  assert.deepEqual(result.value.integration?.merges.map((merge) => [merge.taskId, merge.status]), [["T1", "merged"]]);
  assert.equal(result.value.status, "unverified");
  assert.match(await readFile(join(repo, "index.html"), "utf8"), /doctype/, "the work stays in the shared folder too");
});

test("a failing task still makes the run fail", async () => {
  const repo = await makeRepo();
  const tasks: TaskContract[] = [{ id: "T1", prompt: "build", cwd: repo, allowedPaths: ["index.html"] }];
  const failing: RunWorker = async () => ({ status: "failed", error: "the engine gave up" });

  const result = await runPlan({ repoRoot: repo, tasks, concurrency: 1, runWorker: failing, shouldInstall: false });
  assert.ok(result.ok);
  assert.equal(result.value.status, "failed");
});
