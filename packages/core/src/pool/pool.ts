import type { TaskContract } from "@weave/protocol";
import { Coordinator } from "../coordination/index.ts";
import { nextStep, type ScheduledState, type SkippedTask } from "../scheduler/index.ts";
import { readHeadCommit } from "../shared/index.ts";
import { createResumeSlot, sessionFor, type ResumeSlot } from "./resume.ts";
import { runOneTask } from "./run-with-retry.ts";
import type { BudgetManager } from "../adaptive/index.ts";
import type { PoolContext, PoolOptions, PoolReport, PoolTaskReport } from "./types.ts";

const RUN_STOP_KEY = "";
const NEVER_REACHED_REASON = "never became ready: a dependency cycle or an unknown dependency";

function notRunReport(taskId: string, status: "skipped" | "cancelled", reason: string): PoolTaskReport {
  return { taskId, status, reason, branch: null, harvest: null, finalMessage: null, installMs: 0, agentMs: 0, wallMs: 0, ranIn: null, isRejected: false };
}

interface PoolState {
  readonly states: Map<string, ScheduledState>;
  readonly reports: Map<string, PoolTaskReport>;
  readonly running: Map<string, Promise<PoolTaskReport>>;
  readonly controllers: Map<string, AbortController>;
  readonly stopReasons: Map<string, string>;
  readonly resumeSlot: ResumeSlot;
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

function launch(pool: PoolState, ctx: PoolContext, task: TaskContract, isolate: boolean): void {
  const controller = linkedController(ctx.signal);
  pool.states.set(task.id, "running");
  pool.controllers.set(task.id, controller);
  ctx.coordinator.taskStarted(task.id);
  budgetOf(ctx)?.taskStarted(task.id);
  pool.running.set(task.id, runOneTask(task, { ...ctx, signal: controller.signal }, isolate));
}

function budgetOf(ctx: PoolContext): BudgetManager | undefined {
  return ctx.controls?.budget ?? ctx.budget;
}

function admitted(pool: PoolState, ctx: PoolContext, taskId: string): boolean {
  const admission = budgetOf(ctx)?.admits(taskId) ?? { ok: true };
  if (!admission.ok) skip(pool, ctx, [{ taskId, reason: admission.reason }]);
  return admission.ok;
}

function settle(pool: PoolState, ctx: PoolContext, report: PoolTaskReport): void {
  pool.running.delete(report.taskId);
  pool.controllers.delete(report.taskId);
  const stopReason = pool.stopReasons.get(report.taskId) ?? pool.stopReasons.get(RUN_STOP_KEY);
  record(pool, report.status === "cancelled" && stopReason ? { ...report, reason: stopReason } : report);
  budgetOf(ctx)?.taskSettled(report.taskId);
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
  const priority = ctx.controls?.priorityOf ?? ctx.priorityOf;
  for (const taskId of byPriority(ready, priority)) {
    if (pool.running.size >= capacity) return;
    const task = tasksById.get(taskId);
    if (!task || !admitted(pool, ctx, taskId)) continue;
    if (ctx.controls?.waitForOwnership && isScoped(task)) {
      if (ctx.coordinator.tryClaim(task)) launch(pool, ctx, task, ctx.sharedBase === null);
      continue;
    }
    const canShare = ctx.sharedBase !== null && isScoped(task) && ctx.coordinator.tryClaim(task);
    launch(pool, ctx, task, !canShare);
  }
}

function linkedController(signal: AbortSignal | undefined): AbortController {
  const controller = new AbortController();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  return controller;
}

function bindLate(pool: PoolState, ctx: PoolContext, run: AbortController, bound: { current: BudgetManager | undefined; stop: () => void }): void {
  const budget = ctx.controls?.budget;
  if (!budget || budget === bound.current) return;
  bound.stop();
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
  const unwatch = budget.watch(ctx.ledger);
  bound.current = budget;
  bound.stop = () => {
    unwatch();
    budget.dispose();
  };
}

async function drive(pool: PoolState, ctx: PoolContext, capacityOf: () => number, run: AbortController): Promise<void> {
  const bound = { current: ctx.budget, stop: () => undefined };
  try {
    for (;;) {
      bindLate(pool, ctx, run, bound);
      const change = ctx.coordinator.nextChange();
      const step = nextStep(ctx.coordinator.tasks(), pool.states, ctx.coordinator.publishedKeys());
      skip(pool, ctx, step.skipped);
      if (step.skipped.length > 0) continue;
      if (ctx.signal.aborted && step.ready.length > 0) {
        cancelPending(pool, ctx, step.ready);
        continue;
      }
      if (!ctx.signal.aborted) launchReady(pool, ctx, step.ready, capacityOf());
      if (pool.running.size === 0) return;
      const settled = await Promise.race([...pool.running.values(), change, pool.resumeSlot.promise]);
      if (settled) settle(pool, ctx, settled);
    }
  } finally {
    bound.stop();
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

function isScoped(task: TaskContract): boolean {
  return (task.allowedPaths?.length ?? 0) > 0;
}

async function sharedBaseOf(repoRoot: string, baseCommit: string | undefined): Promise<string | null> {
  const head = await readHeadCommit(repoRoot);
  if (head === null) return null;
  return baseCommit === undefined || baseCommit === head ? head : null;
}

export async function runPool(options: PoolOptions): Promise<PoolReport> {
  const sharedBase = await sharedBaseOf(options.repoRoot, options.baseCommit);
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
    sharedBase,
    inspectHarvest: options.inspectHarvest,
    attempt: options.attempt ?? 0,
    coordinator,
    budget: options.budget,
    priorityOf: options.priorityOf,
    controls: options.controls,
  };
  const capacityOf = () => Math.max(1, Math.floor(options.controls?.concurrency ?? options.concurrency));
  const states = new Map<string, ScheduledState>();
  const reports = new Map<string, PoolTaskReport>();
  const resumeSlot = createResumeSlot(states, reports, () => coordinator.tasks().map((task) => task.id));
  const pool: PoolState = { states, reports, running: new Map(), controllers: new Map(), stopReasons: new Map(), resumeSlot };
  const stopWatching = coordinator.watch(options.ledger);
  const stopBudget = bindBudget(pool, options, controller);
  options.attachSession?.(sessionFor({
    states: pool.states,
    resume: (taskId) => pool.resumeSlot.resume(taskId),
    coordinator,
    controls: options.controls,
  }));
  try {
    await drive(pool, ctx, capacityOf, controller);
  } finally {
    resumeSlot.close();
    stopWatching();
    stopBudget();
  }
  invalidateConsumers(pool, ctx);
  const contracts = coordinator.tasks();
  return {
    tasks: contracts.map((task) => pool.reports.get(task.id) ?? notRunReport(task.id, "skipped", NEVER_REACHED_REASON)),
    coordination: coordinator.report(),
    contracts,
  };
}
