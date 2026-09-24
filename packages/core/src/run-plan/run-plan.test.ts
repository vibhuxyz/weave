import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskContract } from "@weave/protocol";
import type { VerifyWorkspace } from "../integrator/index.ts";
import type { RunWorker } from "../pool/index.ts";
import { readLedger } from "../shared/index.ts";
import { runGit } from "../worktree/index.ts";
import { runPlan } from "./run-plan.ts";

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "weave-run-plan-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  return repo;
}

const task = (id: string, extra: Partial<TaskContract> = {}): TaskContract => ({ id, prompt: id, cwd: "", ...extra });
const verifyOk: VerifyWorkspace = async () => ({ ok: true, rungs: ["build"], detail: "ok" });

test("acceptance: 3 disjoint tasks run concurrently, merge cleanly, and the ledger says who touched what", async () => {
  const repo = await makeRepo();
  let active = 0;
  let peak = 0;
  const worker: RunWorker = async ({ task: running }) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await writeFile(join(running.cwd, `${running.id.toLowerCase()}.ts`), `export const ${running.id} = 1;\n`);
    active -= 1;
    return { status: "ok" };
  };
  const result = await runPlan({
    tasks: [task("T1"), task("T2"), task("T3")],
    repoRoot: repo, concurrency: 3, runWorker: worker, verify: verifyOk, shouldInstall: false,
  });
  assert.ok(result.ok);
  const report = result.value;
  assert.equal(report.status, "ok");
  assert.equal(peak, 3);
  assert.deepEqual(report.integration?.merges.map((merge) => merge.status), ["merged", "merged", "merged"]);
  const events = await readLedger(join(repo, ".weave"), report.runId);
  const touched = events.flatMap((event) => (event.type === "worktree.harvested" ? [[event.taskId, event.files]] : []));
  assert.deepEqual(touched.sort(), [["T1", ["t1.ts"]], ["T2", ["t2.ts"]], ["T3", ["t3.ts"]]]);
  const types = events.map((event) => event.type);
  assert.equal(types[0], "run.started");
  assert.equal(types.at(-1), "run.finished");
  assert.ok(types.includes("integration.finished"));
});

test("a dependent task only starts after its dependency, and merges after it", async () => {
  const repo = await makeRepo();
  const order: string[] = [];
  const worker: RunWorker = async ({ task: running }) => {
    order.push(running.id);
    await writeFile(join(running.cwd, `${running.id}.txt`), running.id);
    return { status: "ok" };
  };
  const result = await runPlan({
    tasks: [task("B", { dependencies: [{ task: "A", requiredOutputs: ["api"] }] }), task("A")],
    repoRoot: repo, concurrency: 2, runWorker: worker, verify: verifyOk, shouldInstall: false,
  });
  assert.ok(result.ok);
  assert.deepEqual(order, ["A", "B"]);
  assert.deepEqual(result.value.integration?.merges.map((merge) => merge.taskId), ["A", "B"]);
});

test("plans that cannot run are refused before anything starts", async () => {
  const repo = await makeRepo();
  const worker: RunWorker = async () => assert.fail("no worker should start");
  const base = { repoRoot: repo, concurrency: 2, runWorker: worker, verify: verifyOk, shouldInstall: false };
  const cyclic = await runPlan({
    ...base,
    tasks: [task("A", { dependencies: [{ task: "B", requiredOutputs: [] }] }), task("B", { dependencies: [{ task: "A", requiredOutputs: [] }] })],
  });
  assert.equal(cyclic.ok, false);
  assert.match(cyclic.ok ? "" : cyclic.reason, /Dependency cycle: A -> B -> A/);
  const reserved = await runPlan({ ...base, tasks: [task("integration")] });
  assert.match(reserved.ok ? "" : reserved.reason, /reserved for Weave's own steps/);
  await writeFile(join(repo, ".gitignore"), "changed\n");
  const dirty = await runPlan({ ...base, tasks: [task("A")] });
  assert.match(dirty.ok ? "" : dirty.reason, /uncommitted change/);
});

test("a dependency discovered mid-run reorders the merge without a restart", async () => {
  const repo = await makeRepo();
  const worker: RunWorker = async ({ task: running, coordination }) => {
    if (running.id === "B") coordination.publish({ type: "dependency.blocked", data: { need: { output: "config", task: "A" }, reason: "needs A's config" } });
    if (running.id === "A") coordination.publish({ type: "artifact.ready", data: { artifact: { name: "config", summary: "c", files: [] } } });
    await writeFile(join(running.cwd, `${running.id}.txt`), running.id);
    return { status: "ok" };
  };
  const result = await runPlan({ tasks: [task("B"), task("A")], repoRoot: repo, concurrency: 2, runWorker: worker, verify: verifyOk, shouldInstall: false });
  assert.ok(result.ok);
  assert.deepEqual(result.value.pool.coordination.addedDependencies, [{ taskId: "B", dependency: { task: "A", requiredOutputs: ["config"] } }]);
  assert.deepEqual(result.value.integration?.merges.map((merge) => merge.taskId), ["A", "B"]);
});
