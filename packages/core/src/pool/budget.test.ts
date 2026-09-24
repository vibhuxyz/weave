import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TaskContract } from "@weave/protocol";
import { BudgetManager } from "../adaptive/index.ts";
import { Ledger } from "../shared/index.ts";
import { runGit } from "../worktree/index.ts";
import { runPool } from "./pool.ts";
import type { RunWorker } from "./types.ts";

async function setup() {
  const repo = await mkdtemp(join(tmpdir(), "weave-budget-pool-"));
  await runGit(repo, ["init", "--quiet", "--initial-branch=main"]);
  await writeFile(join(repo, ".gitignore"), ".weave/\n");
  await runGit(repo, ["add", "-A"]);
  await runGit(repo, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"]);
  const weaveDir = join(repo, ".weave");
  return { repo, weaveDir, ledger: new Ledger(weaveDir, "run1") };
}

test("a task that overspends its budget is stopped mid-run; its dependent is skipped, other work finishes", async () => {
  const { repo, weaveDir, ledger } = await setup();
  const tasks: TaskContract[] = [
    { id: "SPENDY", prompt: "a", cwd: "", allowedPaths: ["SPENDY.txt"] },
    { id: "AFTER", prompt: "b", cwd: "", allowedPaths: ["AFTER.txt"], dependencies: [{ task: "SPENDY", requiredOutputs: [] }] },
    { id: "CHEAP", prompt: "c", cwd: "", allowedPaths: ["CHEAP.txt"] },
  ];
  const worker: RunWorker = async ({ task, ledger: runLedger, signal }) => {
    runLedger.append("attempt.started", { taskId: task.id, attemptIndex: 0, engineId: "codex", sessionId: "" });
    if (task.id !== "SPENDY") {
      await writeFile(join(task.cwd, `${task.id}.txt`), task.id);
      runLedger.append("usage", { taskId: task.id, used: 10, size: 100, costUsd: 0.01 });
      return { status: "ok" };
    }
    runLedger.append("usage", { taskId: task.id, used: 10, size: 100, costUsd: 5 });
    await new Promise<void>((resolve) => (signal.aborted ? resolve() : signal.addEventListener("abort", () => resolve(), { once: true })));
    return { status: "cancelled" };
  };
  const budget = new BudgetManager({ budgets: { task: { maxCostMicroUsd: 1_000_000n } }, ledger, tasks });
  const report = await runPool({ tasks, repoRoot: repo, weaveDir, ledger, concurrency: 2, runWorker: worker, shouldInstall: false, budget });
  assert.deepEqual(report.tasks.map((entry) => [entry.taskId, entry.status]), [["SPENDY", "cancelled"], ["AFTER", "skipped"], ["CHEAP", "ok"]]);
  assert.match(report.tasks[0]?.reason ?? "", /task budget SPENDY exceeded: cost \$5\.000000 of \$1\.000000/);
});
