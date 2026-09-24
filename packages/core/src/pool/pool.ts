import type { TaskContract } from "@weave/protocol";
import { nextStep, type ScheduledState, type SkippedTask } from "../scheduler/index.ts";
import { runOneTask } from "./run-one.ts";
import type { PoolContext, PoolOptions, PoolReport, PoolTaskReport } from "./types.ts";

const NEVER_REACHED_REASON = "never became ready: a dependency cycle or an unknown dependency";

function notRunReport(taskId: string, status: "skipped" | "cancelled", reason: string): PoolTaskReport {
  return { taskId, status, reason, branch: null, harvest: null, finalMessage: null, installMs: 0, agentMs: 0, wallMs: 0 };
}

interface PoolState {
  readonly states: Map<string, ScheduledState>;
  readonly reports: Map<string, PoolTaskReport>;
  readonly running: Map<string, Promise<PoolTaskReport>>;
}

function record(pool: PoolState, report: PoolTaskReport): void {
  pool.states.set(report.taskId, report.status);
  pool.reports.set(report.taskId, report);
}

function skip(pool: PoolState, ctx: PoolContext, skipped: readonly SkippedTask[]): void {
  for (const { taskId, reason } of skipped) {
    ctx.ledger.append("task.skipped", { taskId, reason });
    record(pool, notRunReport(taskId, "skipped", reason));
  }
}

function cancelPending(pool: PoolState, ctx: PoolContext, ready: readonly string[]): void {
  for (const taskId of ready) {
    const reason = "run cancelled before the task started";
    ctx.ledger.append("pool.task.settled", { taskId, status: "cancelled", reason, installMs: 0, agentMs: 0, wallMs: 0 });
    record(pool, notRunReport(taskId, "cancelled", reason));
  }
}

function launch(pool: PoolState, ctx: PoolContext, task: TaskContract): void {
  pool.states.set(task.id, "running");
  pool.running.set(task.id, runOneTask(task, ctx));
}

function linkedController(signal: AbortSignal | undefined): AbortController {
  const controller = new AbortController();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  return controller;
}

export async function runPool(options: PoolOptions): Promise<PoolReport> {
  const controller = linkedController(options.signal);
  const ctx: PoolContext = {
    repoRoot: options.repoRoot,
    weaveDir: options.weaveDir,
    ledger: options.ledger,
    runWorker: options.runWorker,
    signal: controller.signal,
    shouldInstall: options.shouldInstall ?? true,
    baseCommit: options.baseCommit,
    inspectHarvest: options.inspectHarvest,
    attempt: options.attempt ?? 0,
  };
  const tasksById = new Map(options.tasks.map((task) => [task.id, task]));
  const capacity = Math.max(1, Math.floor(options.concurrency));
  const pool: PoolState = { states: new Map(), reports: new Map(), running: new Map() };

  for (;;) {
    const step = nextStep(options.tasks, pool.states);
    skip(pool, ctx, step.skipped);
    if (step.skipped.length > 0) continue;
    if (ctx.signal.aborted && step.ready.length > 0) {
      cancelPending(pool, ctx, step.ready);
      continue;
    }
    const startable = ctx.signal.aborted ? [] : step.ready.slice(0, capacity - pool.running.size);
    for (const taskId of startable) {
      const task = tasksById.get(taskId);
      if (task) launch(pool, ctx, task);
    }
    if (pool.running.size === 0) break;
    const settled = await Promise.race(pool.running.values());
    pool.running.delete(settled.taskId);
    record(pool, settled);
  }

  return {
    tasks: options.tasks.map(
      (task) => pool.reports.get(task.id) ?? notRunReport(task.id, "skipped", NEVER_REACHED_REASON),
    ),
  };
}
