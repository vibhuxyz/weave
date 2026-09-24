import { resolve } from "node:path";
import type { TaskContract, TaskDependency } from "@weave/protocol";
import { integrate, verifyWithLadder, type IntegrationReport } from "../integrator/index.ts";
import { validateGraph } from "../planner/index.ts";
import { runPool, type PoolReport } from "../pool/index.ts";
import { weaveDirFor } from "../runner/index.ts";
import { topologicalOrder } from "../scheduler/index.ts";
import { Ledger, newRunId } from "../shared/index.ts";
import { checkCleanBase, runGit, type WorktreeResult } from "../worktree/index.ts";
import { CONTRACT_REVISION_ID, RESERVED_TASK_IDS } from "./constants.ts";
import { runWithRevisions } from "./revisions.ts";
import { engineWorker } from "./engine-worker.ts";
import type { RunPlanOptions, RunPlanReport, RunPlanResult } from "./types.ts";

async function resolveCommit(repoRoot: string, ref: string): Promise<WorktreeResult<string>> {
  const resolved = await runGit(repoRoot, ["rev-parse", "--verify", `${ref}^{commit}`]);
  return resolved.ok
    ? { ok: true, value: resolved.output.trim() }
    : { ok: false, reason: `Cannot resolve base ${ref} in ${repoRoot}: ${resolved.output.trim()}` };
}

function planIssues(tasks: readonly TaskContract[]): readonly string[] {
  const reserved = tasks
    .filter((task) => RESERVED_TASK_IDS.includes(task.id) || CONTRACT_REVISION_ID.test(task.id))
    .map((task) => `Task id "${task.id}" is reserved for Weave's own steps`);
  return [...(tasks.length === 0 ? ["The plan has no tasks"] : []), ...reserved, ...validateGraph(tasks)];
}

function withAddedDependencies(tasks: readonly TaskContract[], pool: PoolReport): readonly TaskContract[] {
  const addedByTask = new Map<string, TaskDependency[]>();
  for (const edge of pool.coordination.addedDependencies) {
    addedByTask.set(edge.taskId, [...(addedByTask.get(edge.taskId) ?? []), edge.dependency]);
  }
  return tasks.map((task) => {
    const added = addedByTask.get(task.id);
    return added ? { ...task, dependencies: [...(task.dependencies ?? []), ...added] } : task;
  });
}

function mergeCandidates(tasks: readonly TaskContract[], pool: PoolReport) {
  const reports = new Map(pool.tasks.map((entry) => [entry.taskId, entry]));
  return topologicalOrder(withAddedDependencies(tasks, pool)).flatMap((taskId) => {
    const entry = reports.get(taskId);
    if (entry?.status !== "ok" || !entry.branch) return [];
    return [{ taskId, branch: entry.branch, commit: entry.harvest?.commit ?? null }];
  });
}

function overallStatus(pool: PoolReport, integration: IntegrationReport | null, isCancelled: boolean): RunPlanReport["status"] {
  if (isCancelled) return "cancelled";
  if (pool.tasks.some((entry) => entry.status !== "ok")) return "failed";
  return integration?.status ?? "failed";
}

export async function runPlan(options: RunPlanOptions): Promise<RunPlanResult> {
  const issues = planIssues(options.tasks);
  if (issues.length > 0) return { ok: false, reason: `The plan cannot run: ${issues.join("; ")}` };
  const repoRoot = resolve(options.repoRoot);
  const clean = await checkCleanBase(repoRoot);
  if (!clean.ok) return clean;
  const base = options.baseRef === undefined ? clean : await resolveCommit(repoRoot, options.baseRef);
  if (!base.ok) return base;

  const weaveDir = weaveDirFor(repoRoot, options.config);
  const ledger = options.ledger ?? new Ledger(weaveDir, newRunId());
  const started = Date.now();
  ledger.append("run.started", { cwd: repoRoot, config: { concurrency: options.concurrency, tasks: options.tasks.length } });

  const shouldInstall = options.shouldInstall ?? true;
  const tasks = options.tasks.map((task) => ({ ...task, cwd: repoRoot }));
  const runWorker = options.runWorker ?? engineWorker(options.config, options.policy, { weaveDir, model: null });
  const { pool, baseCommit } = await runWithRevisions({
    tasks,
    baseCommit: base.value,
    revise: options.revise,
    signal: options.signal,
    runRound: (roundTasks, roundBase, attempt) => runPool({
      tasks: roundTasks, repoRoot, weaveDir, ledger, shouldInstall, runWorker, attempt,
      baseCommit: roundBase,
      inspectHarvest: options.inspectHarvest,
      concurrency: options.concurrency,
      signal: options.signal,
      budget: options.budget,
      priorityOf: options.priorityOf,
    }),
  });

  const isCancelled = options.signal?.aborted ?? false;
  const candidates = mergeCandidates(tasks, pool);
  const integration = isCancelled || candidates.length === 0
    ? null
    : await integrate({ repoRoot, weaveDir, ledger, baseCommit, candidates, shouldInstall, verify: options.verify ?? verifyWithLadder });

  const status = overallStatus(pool, integration, isCancelled);
  ledger.append("run.finished", { status: status === "ok" ? "ok" : status === "cancelled" ? "cancelled" : "failed", wallMs: Date.now() - started });
  return { ok: true, value: { runId: ledger.runId, ledgerFile: ledger.file, baseCommit, status, pool, integration } };
}
