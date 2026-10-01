import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskContract } from "@weave/protocol";
import { Ledger, readLedger } from "../shared/index.ts";
import { listWeaveWorktrees, runGit } from "../worktree/index.ts";
import { runPool } from "./pool.ts";
import type { RunWorker } from "./types.ts";

const MAX_OVERLAP_WAIT_MS = 5_000;
const POLL_MS = 10;

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

test("three scoped tasks share the folder at once, and each one's files become its own branch", async () => {
  const { repo, weaveDir, ledger, base } = await setup();
  const head = (await runGit(repo, ["rev-parse", "HEAD"])).output.trim();
  let active = 0;
  let peak = 0;
  const cwds = new Set<string>();
  const overlapping: RunWorker = async (input) => {
    active += 1;
    peak = Math.max(peak, active);
    cwds.add(input.task.cwd);
    const deadline = Date.now() + MAX_OVERLAP_WAIT_MS;
    while (active < 3 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    active -= 1;
    return writesOwnFile(input);
  };
  const tasks = ["T1", "T2", "T3"].map((id) => task(id, { allowedPaths: [`${id}.txt`] }));
  const report = await runPool({ ...base, tasks, concurrency: 3, runWorker: overlapping });
  assert.equal(peak, 3);
  assert.deepEqual([...cwds], [repo]);
  assert.deepEqual(report.tasks.map((entry) => [entry.taskId, entry.status, entry.branch, entry.harvest?.files]), [
    ["T1", "ok", "weave/run1/T1", ["T1.txt"]],
    ["T2", "ok", "weave/run1/T2", ["T2.txt"]],
    ["T3", "ok", "weave/run1/T3", ["T3.txt"]],
  ]);
  for (const entry of report.tasks) {
    const tree = await runGit(repo, ["ls-tree", "--name-only", entry.branch ?? "", "--"]);
    assert.deepEqual(tree.output.trim().split("\n"), [".gitignore", `${entry.taskId}.txt`]);
  }
  assert.deepEqual(await listWeaveWorktrees(repo), []);
  assert.equal((await runGit(repo, ["rev-parse", "HEAD"])).output.trim(), head, "the user's branch does not move");
  assert.equal((await runGit(repo, ["status", "--porcelain"])).output.trim().split("\n").length, 3, "the work is still in the folder");
  const harvested = (await readLedger(weaveDir, ledger.runId)).filter((event) => event.type === "worktree.harvested");
  assert.equal(harvested.length, 3);
});

test("tasks with no scope get their own worktrees, because a shared folder could not tell their files apart", async () => {
  const { repo, base } = await setup();
  const cwds = new Set<string>();
  const recordCwd: RunWorker = async (input) => {
    cwds.add(input.task.cwd);
    return writesOwnFile(input);
  };
  const report = await runPool({ ...base, tasks: [task("T1"), task("T2")], concurrency: 2, runWorker: recordCwd });
  assert.equal(cwds.has(repo), false);
  assert.equal(cwds.size, 2);
  assert.deepEqual(report.tasks.map((entry) => entry.harvest?.files), [["T1.txt"], ["T2.txt"]]);
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

test("tasks that write only inside new folders of their own scope pass the scope check", async () => {
  const { base } = await setup();
  const writesInOwnFolder: RunWorker = async ({ task: running }) => {
    const folder = join(running.cwd, "src", running.id);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "app file.ts"), `${running.id}\n`);
    return { status: "ok" };
  };
  const tasks = [task("api", { allowedPaths: ["src/api/**"] }), task("ui", { allowedPaths: ["src/ui/**"] })];
  const report = await runPool({ ...base, tasks, concurrency: 2, runWorker: writesInOwnFolder });
  assert.deepEqual(report.tasks.map((entry) => [entry.taskId, entry.status, entry.reason]), [
    ["api", "ok", null],
    ["ui", "ok", null],
  ]);
});

async function commitOnSideBranch(repo: string, file: string, content: string): Promise<string> {
  await runGit(repo, ["checkout", "--quiet", "-b", "side"]);
  await writeFile(join(repo, file), content);
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "side"]);
  const commit = (await runGit(repo, ["rev-parse", "HEAD"])).output.trim();
  await runGit(repo, ["checkout", "--quiet", "main"]);
  return commit;
}

test("tasks start from the base commit in their own worktrees when the checkout is elsewhere", async () => {
  const { repo, base } = await setup();
  const contract = "export const CONTRACT_VERSION = 1;\n";
  const baseCommit = await commitOnSideBranch(repo, "contract.ts", contract);
  const seen: string[] = [];
  const readsContract: RunWorker = async (input) => {
    seen.push(await readFile(join(input.task.cwd, "contract.ts"), "utf8"));
    return writesOwnFile(input);
  };
  const report = await runPool({ ...base, baseCommit, tasks: [task("T1"), task("T2")], concurrency: 2, runWorker: readsContract });
  assert.deepEqual(seen, [contract, contract]);
  assert.deepEqual(report.tasks.map((entry) => [entry.taskId, entry.status, entry.harvest?.files]), [
    ["T1", "ok", ["T1.txt"]],
    ["T2", "ok", ["T2.txt"]],
  ]);
});

test("a worker in the shared folder learns who else works there; a worker in its own worktree does not", async () => {
  const { repo, base } = await setup();
  const seen = new Map<string, TaskContract["sharedWith"]>();
  const recordTeam: RunWorker = async (input) => {
    seen.set(input.task.id, input.task.sharedWith);
    return writesOwnFile(input);
  };
  await runPool({ ...base, tasks: [task("T1", { allowedPaths: ["client/**"] }), task("T2", { allowedPaths: ["server/**"] })], concurrency: 2, runWorker: recordTeam });
  assert.deepEqual(seen.get("T1"), [{ id: "T2", allowedPaths: ["server/**"] }]);
  assert.deepEqual(seen.get("T2"), [{ id: "T1", allowedPaths: ["client/**"] }]);
  const baseCommit = await commitOnSideBranch(repo, "contract.ts", "export {};\n");
  seen.clear();
  await runPool({ ...base, baseCommit, tasks: [task("T3")], concurrency: 1, runWorker: recordTeam });
  assert.equal(seen.get("T3"), undefined);
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
