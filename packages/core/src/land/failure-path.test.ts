import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskContract } from "@weave/protocol";
import type { VerifyWorkspace } from "../integrator/index.ts";
import type { RunWorker } from "../pool/index.ts";
import { coordinatorReviser } from "../replan/index.ts";
import { runPlan } from "../run-plan/index.ts";
import { Ledger, newRunId, readLedger } from "../shared/index.ts";
import { outputLines, runGit } from "../worktree/index.ts";
import { acceptRun, deliveryPlanOf, discardRun } from "./index.ts";

const ENGINES = [{ id: "claude-code", capabilities: { fileEditing: true, toolCalls: true } }];
const COORDINATOR_NOTE = "<coordinator-note";
const exists = (path: string) => access(path).then(() => true, () => false);
const fenced = (value: unknown) => "```json\n" + JSON.stringify(value) + "\n```";

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "weave-failure-path-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  await writeFile(join(repo, "api.ts"), "export const api = 0;\n");
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  return repo;
}

const failsUntilGuided: RunWorker = async ({ task }) => {
  if (task.id === "API") await writeFile(join(task.cwd, "api.ts"), "export const api = 1;\n");
  if (task.id === "DOCS") await writeFile(join(task.cwd, "api.ts"), "export const api = 'docs';\n");
  if (task.id !== "UI") return { status: "ok" };
  const isGuided = task.prompt.includes(COORDINATOR_NOTE);
  await writeFile(join(task.cwd, "ui.ts"), isGuided ? "export const ui = 1;\n" : "export const ui =\n");
  return isGuided ? { status: "ok" } : { status: "failed", error: "tsc: ui.ts(1,17) expression expected" };
};

function recordingVerify(seen: string[][]): VerifyWorkspace {
  return async (cwd) => {
    seen.push([...outputLines((await runGit(cwd, ["ls-files"])).output)].sort());
    return { ok: true, rungs: ["build"], detail: "build passed" };
  };
}

const RERUN_UI = { action: "rerun", reason: "UI left a syntax error", rerun: [{ id: "UI", guidance: "finish the ui export" }] };

interface Scenario {
  readonly tasks: readonly TaskContract[];
  readonly verify: VerifyWorkspace;
  readonly runWorker?: RunWorker;
  readonly decision?: unknown;
}

async function runWithCoordinator({ tasks, verify, runWorker = failsUntilGuided, decision = RERUN_UI }: Scenario) {
  const repo = await makeRepo();
  const weaveDir = join(repo, ".weave");
  const ledger = new Ledger(weaveDir, newRunId());
  const prompts: string[] = [];
  const revise = coordinatorReviser({
    tasks, engineCandidates: ENGINES, goal: "ship the feature", ledger,
    openTurn: async () => ({
      runTurn: async (prompt) => {
        prompts.push(prompt);
        return fenced(decision);
      },
      close: async () => undefined,
    }),
  });
  const result = await runPlan({ repoRoot: repo, tasks, concurrency: 3, runWorker, verify, ledger, revise, shouldInstall: false });
  assert.ok(result.ok, result.ok ? "" : result.reason);
  return { repo, report: result.value, prompts, events: await readLedger(weaveDir, ledger.runId) };
}

const API: TaskContract = { id: "API", prompt: "api", cwd: "", allowedPaths: ["api.ts"] };
const UI: TaskContract = { id: "UI", prompt: "ui", cwd: "", allowedPaths: ["ui.ts"] };
const DOCS: TaskContract = { id: "DOCS", prompt: "docs", cwd: "" };

test("a failed worker is rerun by the coordinator, every merge is verified, and accepting commits the fixed work", async () => {
  const seen: string[][] = [];
  const { repo, report, prompts, events } = await runWithCoordinator({ tasks: [API, UI], verify: recordingVerify(seen) });

  assert.match(prompts[0] ?? "", /\[worker-failed\] UI: failed: tsc: ui\.ts\(1,17\) expression expected/);
  assert.equal(prompts.length, 1, "the coordinator is not asked again once the rerun succeeds");
  assert.deepEqual(events.flatMap((event) => (event.type === "replan.decided" ? [event.action] : [])), ["rerun"]);
  assert.deepEqual(report.pool.tasks.map((task) => [task.taskId, task.status, task.branch]), [
    ["API", "ok", `weave/${report.runId}/API`],
    ["UI", "ok", `weave/${report.runId}/UI.r1`],
  ]);
  assert.deepEqual(report.integration?.merges.map((merge) => [merge.taskId, merge.status]), [["API", "merged"], ["UI", "merged"]]);
  assert.deepEqual(seen.slice(1), [[".gitignore", "api.ts"], [".gitignore", "api.ts", "ui.ts"]], "checked after each merge, not only at the end");
  assert.equal(report.status, "ok");

  const plan = deliveryPlanOf(report);
  assert.ok(plan);
  assert.deepEqual(plan.workers.map((worker) => [worker.taskId, worker.state, worker.files, worker.merge?.checks]), [
    ["API", "verified", ["api.ts"], ["build"]],
    ["UI", "verified", ["ui.ts"], ["build"]],
  ]);
  const accepted = await acceptRun(repo, plan);
  assert.ok(accepted.ok, accepted.ok ? "" : accepted.reason);
  assert.equal((await runGit(repo, ["show", "HEAD:ui.ts"])).output, "export const ui = 1;\n");
  assert.equal((await runGit(repo, ["status", "--porcelain"])).output.trim(), "");
});

test("a worker that conflicts at merge time fails the run by name, cannot be accepted, and discarding restores your folder", async () => {
  const seen: string[][] = [];
  const { repo, report } = await runWithCoordinator({ tasks: [API, UI, DOCS], verify: recordingVerify(seen) });

  assert.deepEqual(report.pool.tasks.map((task) => [task.taskId, task.status, task.ranIn]), [["API", "ok", "shared"], ["UI", "ok", "shared"], ["DOCS", "ok", "worktree"]]);
  assert.deepEqual(report.integration?.merges.map((merge) => [merge.taskId, merge.status]), [["API", "merged"], ["UI", "merged"], ["DOCS", "conflict"]]);
  assert.equal(report.integration?.brokenBy, "DOCS");
  assert.equal(report.status, "failed");

  const plan = deliveryPlanOf(report);
  assert.ok(plan);
  assert.deepEqual(plan.isolatedFiles, [], "work that never merged is not offered");
  const docs = plan.workers.find((worker) => worker.taskId === "DOCS");
  assert.deepEqual([docs?.state, docs?.commit !== null, docs?.merge?.status], ["rejected", true, "conflict"]);
  assert.match(docs?.reason ?? "", /api\.ts/);
  const refused = await acceptRun(repo, plan);
  assert.ok(!refused.ok);
  assert.match(refused.reason, /failed its checks, so it cannot be accepted/);

  const discarded = await discardRun(repo, plan);
  assert.ok(discarded.ok, discarded.ok ? "" : discarded.reason);
  assert.equal(await readFile(join(repo, "api.ts"), "utf8"), "export const api = 0;\n");
  assert.equal(await exists(join(repo, "ui.ts")), false);
  assert.equal((await runGit(repo, ["status", "--porcelain"])).output.trim(), "");
  const kept = outputLines((await runGit(repo, ["branch", "--list", `weave/${report.runId}/*`])).output).map((line) => line.replace(/^[*+ ]+/, ""));
  assert.ok(["API", "UI", "UI.r1", "DOCS"].every((id) => kept.includes(`weave/${report.runId}/${id}`)), kept.join(", "));
});

test("a merge that breaks the checks is blamed on that worker, and the work before it stays verified", async () => {
  const failsWithUi: VerifyWorkspace = async (cwd) => {
    const hasUi = outputLines((await runGit(cwd, ["ls-files"])).output).includes("ui.ts");
    return hasUi ? { ok: false, rungs: ["tests"], detail: "ui.test.ts: 1 failed" } : { ok: true, rungs: ["tests"], detail: "all passed" };
  };
  const { report } = await runWithCoordinator({ tasks: [API, UI], verify: failsWithUi });
  assert.deepEqual(report.integration?.merges.map((merge) => [merge.taskId, merge.status]), [["API", "merged"], ["UI", "verify-failed"]]);
  assert.equal(report.integration?.brokenBy, "UI");
  assert.equal(report.status, "failed");
  const plan = deliveryPlanOf(report);
  assert.equal(plan?.integrationStatus, "failed");
  assert.deepEqual(plan?.workers.map((worker) => [worker.taskId, worker.state, worker.reason]), [["API", "verified", null], ["UI", "rejected", "ui.test.ts: 1 failed"]]);
});

const writesStray: RunWorker = async ({ task }) => {
  if (task.id === "API") await writeFile(join(task.cwd, "api.ts"), "export const api = 1;\n");
  if (task.id === "UI") await Promise.all([writeFile(join(task.cwd, "ui.ts"), "export const ui = 1;\n"), writeFile(join(task.cwd, "stray.ts"), "1\n")]);
  return { status: "ok" };
};

test("a worker that writes outside its files is rejected, the coordinator hears why, and discarding removes what it wrote", async () => {
  const keepGoing = { action: "continue", reason: "the API part is enough for now", rerun: [] };
  const uiAfterApi: TaskContract = { ...UI, dependencies: [{ task: "API", requiredOutputs: [] }] };
  const { repo, report, prompts, events } = await runWithCoordinator({ tasks: [API, uiAfterApi], verify: recordingVerify([]), runWorker: writesStray, decision: keepGoing });
  assert.match(prompts[0] ?? "", /\[worker-failed\] UI: rejected: .*stray\.ts/);
  assert.deepEqual(events.flatMap((event) => (event.type === "pool.task.settled" ? [[event.taskId, event.status, event.rejected ?? false]] : [])), [["API", "ok", false], ["UI", "failed", true]]);
  const plan = deliveryPlanOf(report);
  assert.ok(plan);
  assert.deepEqual(plan.workers.map((worker) => [worker.taskId, worker.state, worker.files]), [["API", "verified", ["api.ts"]], ["UI", "rejected", ["stray.ts", "ui.ts"]]]);
  assert.deepEqual(plan.sharedFiles, ["api.ts", "stray.ts", "ui.ts"]);
  const discarded = await discardRun(repo, plan);
  assert.ok(discarded.ok, discarded.ok ? "" : discarded.reason);
  assert.equal((await runGit(repo, ["status", "--porcelain"])).output.trim(), "");
});

test("when every shared worker fails, nothing can be accepted but their leftovers can still be discarded", async () => {
  const breaks: RunWorker = async ({ task }) => {
    await writeFile(join(task.cwd, "ui.ts"), "export const ui =\n");
    return { status: "failed", error: "gave up" };
  };
  const stop = { action: "stop", reason: "the UI cannot be built this way", rerun: [] };
  const { repo, report } = await runWithCoordinator({ tasks: [UI], verify: recordingVerify([]), runWorker: breaks, decision: stop });
  assert.equal(report.integration, null);
  const plan = deliveryPlanOf(report);
  assert.ok(plan);
  assert.deepEqual([plan.integrationStatus, plan.integrationHead, plan.workers[0]?.state], ["not-merged", null, "failed"]);
  const refused = await acceptRun(repo, plan);
  assert.ok(!refused.ok);
  assert.match(refused.reason, /Nothing was merged/);
  const discarded = await discardRun(repo, plan);
  assert.ok(discarded.ok, discarded.ok ? "" : discarded.reason);
  assert.equal(await exists(join(repo, "ui.ts")), false);
});
