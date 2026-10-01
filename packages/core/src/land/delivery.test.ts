import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskContract } from "@weave/protocol";
import type { VerifyWorkspace } from "../integrator/index.ts";
import type { RunWorker } from "../pool/index.ts";
import { runPlan } from "../run-plan/index.ts";
import { outputLines, runGit } from "../worktree/index.ts";
import { acceptRun, deliveryPlanOf, discardRun } from "./index.ts";

const exists = (path: string) => access(path).then(() => true, () => false);
const verifyOk: VerifyWorkspace = async () => ({ ok: true, rungs: ["build"], detail: "ok" });

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "weave-deliver-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  await writeFile(join(repo, "api.ts"), "export const api = 0;\n");
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  return repo;
}

const writes: RunWorker = async ({ task }) => {
  if (task.id === "API") await writeFile(join(task.cwd, "api.ts"), "export const api = 1;\n");
  if (task.id === "UI") await writeFile(join(task.cwd, "ui.ts"), "export const ui = 1;\n");
  if (task.id === "DOCS") await writeFile(join(task.cwd, "notes.md"), "# notes\n");
  return { status: "ok" };
};

async function runFor(tasks: readonly TaskContract[]) {
  const repo = await makeRepo();
  const result = await runPlan({ repoRoot: repo, tasks, concurrency: 3, runWorker: writes, verify: verifyOk, shouldInstall: false });
  assert.ok(result.ok, result.ok ? "" : result.reason);
  const plan = deliveryPlanOf(result.value);
  assert.ok(plan);
  return { repo, plan, report: result.value };
}

const SHARED: readonly TaskContract[] = [
  { id: "API", prompt: "api", cwd: "", allowedPaths: ["api.ts"] },
  { id: "UI", prompt: "ui", cwd: "", allowedPaths: ["ui.ts"] },
];

test("accepting a shared-folder run moves your branch to the verified result and keeps the files", async () => {
  const { repo, plan } = await runFor(SHARED);
  assert.deepEqual(plan.sharedFiles, ["api.ts", "ui.ts"]);
  const accepted = await acceptRun(repo, plan);
  assert.ok(accepted.ok, accepted.ok ? "" : accepted.reason);
  assert.equal((await runGit(repo, ["rev-parse", "HEAD"])).output.trim(), plan.integrationHead);
  assert.equal((await runGit(repo, ["rev-parse", "--abbrev-ref", "HEAD"])).output.trim(), "main");
  assert.equal((await runGit(repo, ["status", "--porcelain"])).output.trim(), "");
  assert.match(await readFile(join(repo, "ui.ts"), "utf8"), /ui = 1/);
});

test("discarding a shared-folder run restores the files and keeps the work on its branches", async () => {
  const { repo, plan } = await runFor(SHARED);
  const discarded = await discardRun(repo, plan);
  assert.ok(discarded.ok, discarded.ok ? "" : discarded.reason);
  assert.match(await readFile(join(repo, "api.ts"), "utf8"), /api = 0/);
  assert.equal(await exists(join(repo, "ui.ts")), false);
  assert.equal((await runGit(repo, ["status", "--porcelain"])).output.trim(), "");
  assert.ok(outputLines((await runGit(repo, ["branch", "--list", `weave/${plan.runId}/*`])).output).length >= 2);
});

test("accepting refuses when your branch moved since the run started", async () => {
  const { repo, plan } = await runFor(SHARED);
  await writeFile(join(repo, "other.ts"), "1\n");
  await runGit(repo, ["add", "other.ts"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "mine"]);
  const refused = await acceptRun(repo, plan);
  assert.ok(!refused.ok);
  assert.match(refused.reason, /Your branch moved since the run started/);
});

test("accepting a mixed run also brings in the files of workers that ran in their own worktree", async () => {
  const { repo, plan, report } = await runFor([...SHARED, { id: "DOCS", prompt: "docs", cwd: "" }]);
  assert.deepEqual(report.pool.tasks.map((task) => [task.taskId, task.ranIn]), [["API", "shared"], ["UI", "shared"], ["DOCS", "worktree"]]);
  assert.deepEqual(plan.isolatedFiles, ["notes.md"]);
  assert.equal(await exists(join(repo, "notes.md")), false);
  const accepted = await acceptRun(repo, plan);
  assert.ok(accepted.ok, accepted.ok ? "" : accepted.reason);
  assert.equal(await readFile(join(repo, "notes.md"), "utf8"), "# notes\n");
  assert.equal((await runGit(repo, ["status", "--porcelain"])).output.trim(), "");
});

test("if Weave cannot tell which files existed before the run, discarding changes nothing", async () => {
  const { repo, plan } = await runFor(SHARED);
  const refused = await discardRun(repo, { ...plan, baseCommit: "0".repeat(40) });
  assert.ok(!refused.ok);
  assert.match(refused.reason, /nothing was changed/);
  assert.match(await readFile(join(repo, "api.ts"), "utf8"), /api = 1/);
  assert.match(await readFile(join(repo, "ui.ts"), "utf8"), /ui = 1/);
});
