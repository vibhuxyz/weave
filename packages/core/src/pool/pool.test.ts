import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskContract } from "@weave/protocol";
import { Ledger, readLedger } from "../shared/index.ts";
import { listWeaveWorktrees, runGit } from "../worktree/index.ts";
import { runPool } from "./pool.ts";
import type { RunWorker } from "./types.ts";

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "weave-pool-"));
  for (const args of [["init", "--quiet", "--initial-branch=main"], ["add", "-A"]]) await runGit(repo, args);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  return repo;
}

function task(id: string, extra: Partial<TaskContract> = {}): TaskContract {
  return { id, prompt: `write ${id}`, cwd: "", ...extra };
}

const writesOwnFile: RunWorker = async ({ task: running }) => {
  await writeFile(join(running.cwd, `${running.id}.txt`), `${running.id}\n`);
  return { status: "ok" };
};

async function setup() {
  const repo = await makeRepo();
  const weaveDir = join(repo, ".weave");
  const ledger = new Ledger(weaveDir, "run1");
  return { repo, weaveDir, ledger, base: { repoRoot: repo, weaveDir, ledger, shouldInstall: false } };
}

test("three independent tasks run at the same time in separate worktrees", async () => {
  const { repo, weaveDir, ledger, base } = await setup();
  let active = 0;
  let peak = 0;
  const cwds = new Set<string>();
  const overlapping: RunWorker = async (input) => {
    active += 1;
    peak = Math.max(peak, active);
    cwds.add(input.task.cwd);
    await new Promise((resolve) => setTimeout(resolve, 50));
    active -= 1;
    return writesOwnFile(input);
  };
  const report = await runPool({ ...base, tasks: [task("T1"), task("T2"), task("T3")], concurrency: 3, runWorker: overlapping });
  assert.equal(peak, 3);
  assert.equal(cwds.size, 3);
  assert.deepEqual(report.tasks.map((entry) => [entry.taskId, entry.status, entry.harvest?.files]), [
    ["T1", "ok", ["T1.txt"]],
    ["T2", "ok", ["T2.txt"]],
    ["T3", "ok", ["T3.txt"]],
  ]);
  assert.deepEqual(await listWeaveWorktrees(repo), []);
  assert.ok((await runGit(repo, ["rev-parse", "--verify", "weave/run1/T2"])).ok);
  const harvested = (await readLedger(weaveDir, ledger.runId)).filter((event) => event.type === "worktree.harvested");
  assert.deepEqual(harvested.map((event) => event.type === "worktree.harvested" && [event.taskId, event.files]).sort(), [
    ["T1", ["T1.txt"]],
    ["T2", ["T2.txt"]],
    ["T3", ["T3.txt"]],
  ]);
});

test("the concurrency cap holds", async () => {
  const { base } = await setup();
  let active = 0;
  let peak = 0;
  const slow: RunWorker = async (input) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 30));
    active -= 1;
    return writesOwnFile(input);
  };
  await runPool({ ...base, tasks: ["A", "B", "C", "D"].map((id) => task(id)), concurrency: 2, runWorker: slow });
  assert.equal(peak, 2);
});

test("a crashed worker fails its task and skips what depends on it", async () => {
  const { base } = await setup();
  const crashing: RunWorker = async (input) => {
    if (input.task.id === "T1") throw new Error("engine exited with code 1");
    return writesOwnFile(input);
  };
  const tasks = [task("T1"), task("T2"), task("T3", { dependencies: [{ task: "T1", requiredOutputs: [] }] })];
  const report = await runPool({ ...base, tasks, concurrency: 2, runWorker: crashing });
  assert.deepEqual(report.tasks.map((entry) => [entry.taskId, entry.status, entry.reason]), [
    ["T1", "failed", "worker crashed: engine exited with code 1"],
    ["T2", "ok", null],
    ["T3", "skipped", "dependency T1 ended as failed"],
  ]);
});

test("writing outside allowedPaths fails the task even when the worker says ok", async () => {
  const { base } = await setup();
  const report = await runPool({
    ...base,
    tasks: [task("T1", { allowedPaths: ["src/**"] })],
    concurrency: 1,
    runWorker: writesOwnFile,
  });
  assert.equal(report.tasks[0]?.status, "failed");
  assert.equal(report.tasks[0]?.reason, "wrote outside its scope: T1.txt is outside allowedPaths");
});

test("cancelling stops running workers, cancels queued tasks and skips dependents", async () => {
  const { repo, base } = await setup();
  const controller = new AbortController();
  const waitsForCancel: RunWorker = ({ signal }) =>
    new Promise((resolve) => {
      signal.addEventListener("abort", () => resolve({ status: "cancelled" }), { once: true });
      setTimeout(() => controller.abort(), 20);
    });
  const tasks = [task("T1"), task("T2"), task("T3", { dependencies: [{ task: "T1", requiredOutputs: [] }] })];
  const report = await runPool({ ...base, tasks, concurrency: 1, runWorker: waitsForCancel, signal: controller.signal });
  assert.deepEqual(report.tasks.map((entry) => [entry.taskId, entry.status]), [
    ["T1", "cancelled"],
    ["T2", "cancelled"],
    ["T3", "skipped"],
  ]);
  assert.deepEqual(await listWeaveWorktrees(repo), []);
});

test("with a priority, the ready task that heads the longest path starts first", async () => {
  const { base } = await setup();
  const order: string[] = [];
  const recordOrder: RunWorker = async (input) => {
    order.push(input.task.id);
    return writesOwnFile(input);
  };
  const tasks = [task("SHORT"), task("HEAD"), task("TAIL", { dependencies: [{ task: "HEAD", requiredOutputs: [] }] })];
  const priorities: Readonly<Record<string, number>> = { SHORT: 1, HEAD: 10, TAIL: 5 };
  await runPool({ ...base, tasks, concurrency: 1, runWorker: recordOrder, priorityOf: (taskId) => priorities[taskId] ?? 0 });
  assert.deepEqual(order, ["HEAD", "TAIL", "SHORT"]);
});
