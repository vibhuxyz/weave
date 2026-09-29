import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskContract } from "@weave/protocol";
import { runPool, type RunWorker } from "../pool/index.ts";
import { decideReplan, replanTriggers } from "../replan/index.ts";
import { Ledger } from "../shared/index.ts";
import { intake } from "../intake/index.ts";
import { planVerification, runLadder } from "../verify/index.ts";
import { inspectWorkspace, manageWorker } from "../worker-manager/index.ts";
import type { WorkerTrace } from "../worker-manager/index.ts";
import { runGit } from "../worktree/index.ts";

const PASSING = "export const total = (a: number, b: number): number => a + b;\n";
const BROKEN = "export const total = (a: number, b: number): number => a - b;\n";

async function makeRepo(): Promise<{ repo: string; weaveDir: string; ledger: Ledger }> {
  const repo = await mkdtemp(join(tmpdir(), "weave-recovery-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(join(repo, "src", "total.ts"), BROKEN);
  await writeFile(
    join(repo, "run-tests.sh"),
    ["#!/bin/sh", 'grep -q "a + b" src/total.ts || { echo "total is wrong"; exit 1; }', 'echo ok'].join("\n"),
  );
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  const weaveDir = join(repo, ".weave");
  return { repo, weaveDir, ledger: new Ledger(weaveDir, "run1") };
}

test("a failing test drives a replan, the rerun fixes it, and the test then passes", async () => {
  const { repo, weaveDir, ledger } = await makeRepo();
  const detected = await intake(repo);
  const plan = { steps: [{ layer: "repository" as const, rung: "tests" as const, command: "sh run-tests.sh", why: "the project suite" }], skipped: [] };

  const before = await runLadder(plan, repo, detected);
  assert.equal(before.ok, false, "the suite must start red");
  assert.match(before.runs[0]?.output ?? "", /total is wrong/);

  const tasks: readonly TaskContract[] = [
    { id: "T1", prompt: "make the sums right", cwd: "", allowedPaths: ["src/**"] },
  ];

  const failing: RunWorker = async () => ({ status: "failed", error: `verification failed: ${before.runs[0]?.output.trim()}` });
  const firstRun = await runPool({ repoRoot: repo, weaveDir, ledger, tasks, concurrency: 1, runWorker: failing, shouldInstall: false });
  assert.equal(firstRun.tasks[0]?.status, "failed");

  const triggers = replanTriggers(firstRun);
  assert.deepEqual(triggers.map((trigger) => [trigger.kind, trigger.taskId]), [["worker-failed", "T1"]]);
  assert.match(triggers[0]?.detail ?? "", /total is wrong/);

  const decision = await decideReplan({
    goal: "make the sums right",
    round: 1,
    tasks,
    outcomes: firstRun.tasks.map((entry) => ({ taskId: entry.taskId, status: entry.status, reason: entry.reason })),
    triggers,
    engineIds: ["engine-a", "engine-b"],
    runTurn: async () =>
      JSON.stringify({
        action: "rerun",
        reason: "the subtraction in total.ts is the cause",
        rerun: [{ id: "T1", engine: "engine-b", guidance: "use addition, not subtraction" }],
      }),
  });
  assert.equal(decision.decision.action, "rerun");
  assert.deepEqual(decision.decision.rerun.map((entry) => entry.id), ["T1"]);

  const fixing: RunWorker = async ({ task }) => {
    await writeFile(join(task.cwd, "src", "total.ts"), PASSING);
    return { status: "ok" };
  };
  const secondRun = await runPool({
    repoRoot: repo,
    weaveDir,
    ledger,
    tasks,
    concurrency: 1,
    runWorker: fixing,
    shouldInstall: false,
    attempt: 1,
  });
  assert.equal(secondRun.tasks[0]?.status, "ok");

  const after = await runLadder(plan, repo, detected);
  assert.equal(after.ok, true, "the suite must end green");
  assert.match(await readFile(join(repo, "src", "total.ts"), "utf8"), /a \+ b/);
});

test("a killed worker is inspected before the retry, and the retry recovers", async () => {
  const { repo, weaveDir, ledger } = await makeRepo();
  const traces: WorkerTrace[] = [];
  let attempts = 0;

  const killed: RunWorker = async ({ task }) => {
    attempts += 1;
    if (attempts === 1) {
      await writeFile(join(task.cwd, "src", "total.ts"), "export const total = (a: number, b: number): number => a\n");
      throw new Error("engine crashed hard");
    }
    await writeFile(join(task.cwd, "src", "total.ts"), PASSING);
    return { status: "ok" };
  };

  const managed = manageWorker({
    run: killed,
    defaultRuntimeId: "generalist",
    retry: { maxAttempts: 2, backoffMs: 0 },
    inspect: (taskId, cwd) => inspectWorkspace({ taskId, cwd }),
    onTrace: (trace) => traces.push(trace),
  });

  const report = await runPool({
    repoRoot: repo,
    weaveDir,
    ledger,
    tasks: [{ id: "T1", prompt: "fix it", cwd: "", allowedPaths: ["src/**"] }],
    concurrency: 1,
    runWorker: managed,
    shouldInstall: false,
  });

  assert.equal(report.tasks[0]?.status, "ok");
  assert.equal(attempts, 2);

  const crashed = traces[0]?.attempts[0];
  assert.equal(crashed?.status, "failed");
  assert.match(crashed?.reason ?? "", /engine crashed hard/);

  const inspection = crashed?.inspection;
  assert.ok(inspection, "the workspace must be inspected before a retry");
  assert.equal(inspection.isDirty, true, "the half-finished edit must be visible to the retry");
  assert.deepEqual(inspection.modifiedFiles, ["src/total.ts"]);
  assert.ok(inspection.checkpoint, "the commit the attempt started from must be recorded");

  assert.equal(traces[0]?.attempts[1]?.inspection, null, "the successful attempt needs no inspection");
  assert.match(await readFile(join(repo, "src", "total.ts"), "utf8"), /a \+ b/);
});
