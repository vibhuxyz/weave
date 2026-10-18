import type { TaskContract } from "@weave/protocol";
import {
  createWorktree,
  harvestWorktree,
  installWorktree,
  removeWorktree,
  snapshotFiles,
  taskBranchName,
  type Harvest,
  type Worktree,
} from "../worktree/index.ts";
import { compressToolOutput } from "../compress/index.ts";
import { describeViolations, scopeViolations } from "./scope.ts";
import { readGitStatus } from "../shared/index.ts";
import type { PoolContext, PoolTaskReport, WorkerOutcome } from "./types.ts";

const INSTALL_REASON_MAX_CHARS = 600;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface HarvestOutcome {
  readonly harvest: Harvest | null;
  readonly branch: string | null;
  readonly problem: string | null;
}

function attemptIdOf(task: TaskContract, ctx: PoolContext, retryIndex: number): string {
  const base = ctx.attempt === 0 ? task.id : `${task.id}.r${ctx.attempt}`;
  return retryIndex === 0 ? base : `${base}.retry${retryIndex}`;
}

async function openWorktree(task: TaskContract, ctx: PoolContext): Promise<Worktree | string> {
  try {
    const worktreeId = attemptIdOf(task, ctx, ctx.retryIndex ?? 0);
    const worktree = await createWorktree({ repoRoot: ctx.repoRoot, weaveDir: ctx.weaveDir, taskId: worktreeId, runId: ctx.ledger.runId, baseRef: ctx.baseCommit });
    ctx.ledger.append("worktree.created", { taskId: task.id, path: worktree.path, branch: worktree.branch, baseCommit: worktree.baseCommit });
    return worktree;
  } catch (error: unknown) {
    return errorText(error);
  }
}

async function install(task: TaskContract, worktree: Worktree, ctx: PoolContext): Promise<{ ms: number; problem: string | null }> {
  if (!ctx.shouldInstall) return { ms: 0, problem: null };
  const outcome = await installWorktree(worktree.path);
  const isSkipped = outcome.status === "skipped";
  ctx.ledger.append("worktree.installed", {
    taskId: task.id,
    status: outcome.status,
    command: isSkipped ? null : outcome.command,
    durationMs: isSkipped ? 0 : outcome.durationMs,
    detail: isSkipped ? outcome.reason : outcome.outputTail,
  });
  if (isSkipped) return { ms: 0, problem: null };
  const problem = `install failed (${outcome.command}): ${compressToolOutput(outcome.outputTail, INSTALL_REASON_MAX_CHARS)}`;
  return { ms: outcome.durationMs, problem: outcome.status === "failed" ? problem : null };
}

function teammatesOf(task: TaskContract, ctx: PoolContext): TaskContract["sharedWith"] {
  return ctx.coordinator.tasks()
    .filter((other) => other.id !== task.id)
    .map((other) => ({ id: other.id, allowedPaths: [...(other.allowedPaths ?? [])] }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function work(task: TaskContract, cwd: string, ctx: PoolContext): Promise<{ ms: number; outcome: WorkerOutcome }> {
  const started = Date.now();
  const isShared = cwd === ctx.repoRoot;
  const running: TaskContract = { ...task, cwd, ...(isShared ? { sharedWith: teammatesOf(task, ctx) } : {}) };
  const outcome = await ctx
    .runWorker({ task: running, ledger: ctx.ledger, signal: ctx.signal, coordination: ctx.coordinator.channelFor(task.id) })
    .catch((error: unknown): WorkerOutcome => ({ status: "failed", error: `worker crashed: ${errorText(error)}` }));
  const settled: WorkerOutcome = ctx.signal.aborted ? { status: "cancelled", error: "run cancelled" } : outcome;
  return { ms: Date.now() - started, outcome: settled };
}

function isInScope(task: TaskContract, path: string): boolean {
  return scopeViolations([path], task).length === 0;
}

async function harvestShared(task: TaskContract, ctx: PoolContext, before: Set<string>): Promise<HarvestOutcome> {
  const dirty = (await readGitStatus(ctx.repoRoot)).changes.map((change) => change.path);
  const otherTasks = ctx.coordinator.tasks().filter((other) => other.id !== task.id);
  const unclaimed = dirty.filter((path) => !before.has(path) && !isInScope(task, path) && !otherTasks.some((other) => isInScope(other, path)));
  if (ctx.sharedBase === null) return { harvest: null, branch: null, problem: `${ctx.repoRoot} has no base commit to record ${task.id}'s work on` };
  const branch = taskBranchName(ctx.ledger.runId, attemptIdOf(task, ctx, ctx.retryIndex ?? 0));
  const mine = dirty.filter((path) => isInScope(task, path));
  const snapshot = await snapshotFiles({ repoRoot: ctx.repoRoot, baseCommit: ctx.sharedBase, branch, files: [...mine, ...unclaimed], message: `weave: ${task.id}` });
  if (!snapshot.ok) return { harvest: null, branch: null, problem: snapshot.reason };
  ctx.ledger.append("worktree.harvested", { taskId: task.id, commit: snapshot.value.commit, files: [...snapshot.value.files] });
  const recorded = { harvest: snapshot.value, branch: snapshot.value.commit === null ? null : branch };
  if (unclaimed.length > 0) return { ...recorded, problem: describeViolations(scopeViolations(unclaimed, task)) };
  const inspected = ctx.inspectHarvest ? await ctx.inspectHarvest(task, ctx.repoRoot, snapshot.value.files) : null;
  return { ...recorded, problem: inspected };
}

async function harvestIsolated(task: TaskContract, worktree: Worktree, ctx: PoolContext): Promise<HarvestOutcome> {
  const harvested = await harvestWorktree(worktree, `weave: ${task.id}`);
  if (!harvested.ok) return { harvest: null, branch: worktree.branch, problem: harvested.reason };
  ctx.ledger.append("worktree.harvested", { taskId: task.id, commit: harvested.value.commit, files: [...harvested.value.files] });
  const files = harvested.value.files;
  const violations = scopeViolations(files, task);
  if (violations.length > 0) return { harvest: harvested.value, branch: worktree.branch, problem: describeViolations(violations) };
  const inspected = ctx.inspectHarvest ? await ctx.inspectHarvest(task, worktree.path, files) : null;
  return { harvest: harvested.value, branch: worktree.branch, problem: inspected };
}

async function teardown(task: TaskContract, worktree: Worktree | null, ctx: PoolContext): Promise<void> {
  if (!worktree) return;
  try {
    await removeWorktree(ctx.repoRoot, worktree);
    ctx.ledger.append("worktree.removed", { taskId: task.id, path: worktree.path });
  } catch (error: unknown) {
    ctx.ledger.append("error", { taskId: task.id, where: "pool.teardown", message: errorText(error) });
  }
}

type RanTaskReport = PoolTaskReport & { readonly status: WorkerOutcome["status"] };

function settle(ctx: PoolContext, report: RanTaskReport, quiet: boolean): PoolTaskReport {
  if (quiet) return report;
  const { taskId, status, reason, installMs, agentMs, wallMs } = report;
  ctx.ledger.append("pool.task.settled", { taskId, status, reason, installMs, agentMs, wallMs, ...(report.isRejected ? { rejected: true } : {}) });
  return report;
}

export interface AttemptOptions {
  readonly isolate: boolean;
  readonly quiet: boolean;
  readonly retryIndex: number;
}

export async function attemptTask(task: TaskContract, parent: PoolContext, options: AttemptOptions): Promise<PoolTaskReport> {
  const ctx: PoolContext = { ...parent, retryIndex: options.retryIndex };
  const started = Date.now();
  const isolate = options.isolate;
  const base = { taskId: task.id, branch: null, harvest: null, finalMessage: null, installMs: 0, agentMs: 0, ranIn: isolate ? ("worktree" as const) : ("shared" as const), isRejected: false, isSetupFailure: false };

  let worktree: Worktree | null = null;
  let cwd = ctx.repoRoot;
  const before = new Set((await readGitStatus(ctx.repoRoot)).changes.map((c) => c.path));

  if (isolate) {
    const wt = await openWorktree(task, ctx);
    if (typeof wt === "string") return settle(ctx, { ...base, status: "failed", reason: wt, wallMs: Date.now() - started }, options.quiet);
    worktree = wt;
    cwd = worktree.path;
  }

  try {
    const installed = worktree ? await install(task, worktree, ctx) : { ms: 0, problem: null };
    const withInstall = { ...base, branch: worktree?.branch ?? null, installMs: installed.ms };
    if (installed.problem) return settle(ctx, { ...withInstall, status: "failed", isSetupFailure: true, reason: installed.problem, wallMs: Date.now() - started }, options.quiet);

    const worked = await work(task, cwd, ctx);
    const harvested = worktree ? await harvestIsolated(task, worktree, ctx) : await harvestShared(task, ctx, before);
    const reason = worked.outcome.error ?? harvested.problem;
    const isRejected = worked.outcome.status === "ok" && harvested.problem !== null;
    const status = isRejected ? "failed" : worked.outcome.status;
    const finalMessage = worked.outcome.finalMessage ?? null;
    return settle(ctx, { ...withInstall, branch: harvested.branch, agentMs: worked.ms, harvest: harvested.harvest, finalMessage, status, isRejected, reason: reason ?? null, wallMs: Date.now() - started }, options.quiet);
  } finally {
    await teardown(task, worktree, ctx);
  }
}
