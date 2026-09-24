import type { TaskContract } from "@weave/protocol";
import { Coordinator } from "../coordination/index.ts";
import { nextStep, type ScheduledState, type SkippedTask } from "../scheduler/index.ts";
import { runOneTask } from "./run-one.ts";
import type { PoolContext, PoolOptions, PoolReport, PoolTaskReport } from "./types.ts";

const RUN_STOP_KEY = "";
const NEVER_REACHED_REASON = "never became ready: a dependency cycle or an unknown dependency";

function notRunReport(taskId: string, status: "skipped" | "cancelled", reason: string): PoolTaskReport {
  return { taskId, status, reason, branch: null, harvest: null, finalMessage: null, installMs: 0, agentMs: 0, wallMs: 0 };
}

interface PoolState {
  readonly states: Map<string, ScheduledState>;
  readonly reports: Map<string, PoolTaskReport>;
  readonly running: Map<string, Promise<PoolTaskReport>>;
  readonly controllers: Map<string, AbortController>;
  readonly stopReasons: Map<string, string>;
}

function record(pool: PoolState, report: PoolTaskReport): void {
  pool.states.set(report.taskId, report.status);
  pool.reports.set(report.taskId, report);
}

function skip(pool: PoolState, ctx: PoolContext, skipped: readonly SkippedTask[]): void {
  for (const { taskId, reason } of skipped) {
    ctx.ledger.append("task.skipped", { taskId, reason });
    record(pool, notRunReport(taskId, "skipped", reason));
    ctx.coordinator.taskSettled(taskId, "skipped");
  }
}

function cancelPending(pool: PoolState, ctx: PoolContext, ready: readonly string[]): void {
  for (const taskId of ready) {
    const reason = pool.stopReasons.get(RUN_STOP_KEY) ?? "run cancelled before the task started";
    ctx.ledger.append("pool.task.settled", { taskId, status: "cancelled", reason, installMs: 0, agentMs: 0, wallMs: 0 });
    record(pool, notRunReport(taskId, "cancelled", reason));
  }
}

function launch(pool: PoolState, ctx: PoolContext, task: TaskContract): void {
  const controller = linkedController(ctx.signal);
  pool.states.set(task.id, "running");
  pool.controllers.set(task.id, controller);
  ctx.coordinator.taskStarted(task.id);
  ctx.budget?.taskStarted(task.id);
  pool.running.set(task.id, runOneTask(task, { ...ctx, signal: controller.signal }));
}

function admitted(pool: PoolState, ctx: PoolContext, taskId: string): boolean {
  const admission = ctx.budget?.admits(taskId) ?? { ok: true };
  if (!admission.ok) skip(pool, ctx, [{ taskId, reason: admission.reason }]);
  return admission.ok;
}

function settle(pool: PoolState, ctx: PoolContext, report: PoolTaskReport): void {
  pool.running.delete(report.taskId);
  pool.controllers.delete(report.taskId);
  const stopReason = pool.stopReasons.get(report.taskId) ?? pool.stopReasons.get(RUN_STOP_KEY);
  record(pool, report.status === "cancelled" && stopReason ? { ...report, reason: stopReason } : report);
  ctx.budget?.taskSettled(report.taskId);
  ctx.coordinator.taskSettled(report.taskId, report.status);
}

function byPriority(ready: readonly string[], priorityOf: ((taskId: string) => number) | undefined): readonly string[] {
  if (!priorityOf) return ready;
  return ready.map((taskId, index) => ({ taskId, index, priority: priorityOf(taskId) }))
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .map((entry) => entry.taskId);
}

function launchReady(pool: PoolState, ctx: PoolContext, ready: readonly string[], capacity: number): void {
  const tasksById = new Map(ctx.coordinator.tasks().map((task) => [task.id, task]));
  for (const taskId of byPriority(ready, ctx.priorityOf)) {
    if (pool.running.size >= capacity) return;
    const task = tasksById.get(taskId);
    if (task && admitted(pool, ctx, taskId) && ctx.coordinator.claim(task)) launch(pool, ctx, task);
  }
}

function linkedController(signal: AbortSignal | undefined): AbortController {
  const controller = new AbortController();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  return controller;
}

async function drive(pool: PoolState, ctx: PoolContext, capacity: number): Promise<void> {
  for (;;) {
    const step = nextStep(ctx.coordinator.tasks(), pool.states, ctx.coordinator.availableOutputs());
    skip(pool, ctx, step.skipped);
    if (step.skipped.length > 0) continue;
    if (ctx.signal.aborted && step.ready.length > 0) {
      cancelPending(pool, ctx, step.ready);
      continue;
    }
    if (!ctx.signal.aborted) launchReady(pool, ctx, step.ready, capacity);
    if (pool.running.size === 0) return;
    const settled = await Promise.race([...pool.running.values(), ctx.coordinator.nextChange()]);
    if (settled) settle(pool, ctx, settled);
  }
}

function invalidateConsumers(pool: PoolState, ctx: PoolContext): void {
  const reasons = ctx.coordinator.invalidations((taskId) => pool.reports.get(taskId)?.status === "ok");
  for (const [taskId, reason] of reasons) {
    const report = pool.reports.get(taskId);
    if (!report) continue;
    ctx.ledger.append("consumer.invalidated", { taskId, reason });
    record(pool, { ...report, status: "failed", reason });
  }
}

function bindBudget(pool: PoolState, options: PoolOptions, run: AbortController): () => void {
  const budget = options.budget;
  if (!budget) return () => undefined;
  budget.bind({
    stopTask: (taskId, reason) => {
      pool.stopReasons.set(taskId, reason);
      pool.controllers.get(taskId)?.abort();
    },
    stopRun: (reason) => {
      pool.stopReasons.set(RUN_STOP_KEY, reason);
      run.abort();
    },
  });
  const unwatch = budget.watch(options.ledger);
  return () => {
    unwatch();
    budget.dispose();
  };
}

export async function runPool(options: PoolOptions): Promise<PoolReport> {
  const controller = linkedController(options.signal);
  const coordinator = options.coordinator ?? new Coordinator({ tasks: options.tasks, ledger: options.ledger });
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
    coordinator,
    budget: options.budget,
    priorityOf: options.priorityOf,
  };
  const capacity = Math.max(1, Math.floor(options.concurrency));
  const pool: PoolState = { states: new Map(), reports: new Map(), running: new Map(), controllers: new Map(), stopReasons: new Map() };
  const stopWatching = coordinator.watch(options.ledger);
  const stopBudget = bindBudget(pool, options, controller);
  try {
    await drive(pool, ctx, capacity);
  } finally {
    stopWatching();
    stopBudget();
  }
  invalidateConsumers(pool, ctx);
  return {
    tasks: options.tasks.map(
      (task) => pool.reports.get(task.id) ?? notRunReport(task.id, "skipped", NEVER_REACHED_REASON),
    ),
    coordination: coordinator.report(),
  };
}
