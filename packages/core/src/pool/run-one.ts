import type { TaskContract } from "@weave/protocol";
import {
  createWorktree,
  harvestWorktree,
  installWorktree,
  removeWorktree,
  type Harvest,
  type Worktree,
} from "../worktree/index.ts";
import { compressToolOutput } from "../compress/index.ts";
import { describeViolations, scopeViolations } from "./scope.ts";
import type { PoolContext, PoolTaskReport, WorkerOutcome } from "./types.ts";

const INSTALL_REASON_MAX_CHARS = 600;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function openWorktree(task: TaskContract, ctx: PoolContext): Promise<Worktree | string> {
  try {
    const worktreeId = ctx.attempt === 0 ? task.id : `${task.id}.r${ctx.attempt}`;
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

async function work(task: TaskContract, worktree: Worktree, ctx: PoolContext): Promise<{ ms: number; outcome: WorkerOutcome }> {
  const started = Date.now();
  const outcome = await ctx
    .runWorker({ task: { ...task, cwd: worktree.path }, ledger: ctx.ledger, signal: ctx.signal, coordination: ctx.coordinator.channelFor(task.id) })
    .catch((error: unknown): WorkerOutcome => ({ status: "failed", error: `worker crashed: ${errorText(error)}` }));
  const settled: WorkerOutcome = ctx.signal.aborted ? { status: "cancelled", error: "run cancelled" } : outcome;
  return { ms: Date.now() - started, outcome: settled };
}

async function harvest(task: TaskContract, worktree: Worktree, ctx: PoolContext): Promise<{ harvest: Harvest | null; problem: string | null }> {
  const harvested = await harvestWorktree(worktree, `weave: ${task.id}`);
  if (!harvested.ok) return { harvest: null, problem: harvested.reason };
  ctx.ledger.append("worktree.harvested", { taskId: task.id, commit: harvested.value.commit, files: [...harvested.value.files] });
  const violations = scopeViolations(harvested.value.files, task);
  if (violations.length > 0) return { harvest: harvested.value, problem: describeViolations(violations) };
  const inspected = ctx.inspectHarvest ? await ctx.inspectHarvest(task, worktree.path, harvested.value.files) : null;
  return { harvest: harvested.value, problem: inspected };
}

async function teardown(task: TaskContract, worktree: Worktree, ctx: PoolContext): Promise<void> {
  try {
    await removeWorktree(ctx.repoRoot, worktree);
    ctx.ledger.append("worktree.removed", { taskId: task.id, path: worktree.path });
  } catch (error: unknown) {
    ctx.ledger.append("error", { taskId: task.id, where: "pool.teardown", message: errorText(error) });
  }
}

type RanTaskReport = PoolTaskReport & { readonly status: WorkerOutcome["status"] };

function settle(ctx: PoolContext, report: RanTaskReport): PoolTaskReport {
  const { taskId, status, reason, installMs, agentMs, wallMs } = report;
  ctx.ledger.append("pool.task.settled", { taskId, status, reason, installMs, agentMs, wallMs });
  return report;
}

export async function runOneTask(task: TaskContract, ctx: PoolContext): Promise<PoolTaskReport> {
  const started = Date.now();
  const base = { taskId: task.id, branch: null, harvest: null, finalMessage: null, installMs: 0, agentMs: 0 };
  const worktree = await openWorktree(task, ctx);
  if (typeof worktree === "string") return settle(ctx, { ...base, status: "failed", reason: worktree, wallMs: Date.now() - started });
  try {
    const installed = await install(task, worktree, ctx);
    const withInstall = { ...base, branch: worktree.branch, installMs: installed.ms };
    if (installed.problem) return settle(ctx, { ...withInstall, status: "failed", reason: installed.problem, wallMs: Date.now() - started });
    const worked = await work(task, worktree, ctx);
    const harvested = await harvest(task, worktree, ctx);
    const reason = worked.outcome.error ?? harvested.problem;
    const status = worked.outcome.status === "ok" && harvested.problem ? "failed" : worked.outcome.status;
    const finalMessage = worked.outcome.finalMessage ?? null;
    return settle(ctx, { ...withInstall, agentMs: worked.ms, harvest: harvested.harvest, finalMessage, status, reason: reason ?? null, wallMs: Date.now() - started });
  } finally {
    await teardown(task, worktree, ctx);
  }
}
