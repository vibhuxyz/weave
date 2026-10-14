import type { TaskContract } from "@weave/protocol";
import { attemptTask } from "./run-one.ts";
import { decideRetry, delay, MAX_PUBLISH_RETRIES, MAX_TRANSIENT_RETRIES, missingOutputs, notedTask, type RetryCounts } from "./retry.ts";
import type { PoolContext, PoolTaskReport } from "./types.ts";

function waitingReason(taskId: string, reason: string): string {
  return `waiting while ${taskId} retries: ${reason}`;
}

function tellWaiters(taskId: string, reason: string, ctx: PoolContext): void {
  for (const task of ctx.coordinator.tasks()) {
    const waits = (task.dependencies ?? []).some((dependency) => dependency.task === taskId);
    if (!waits) continue;
    ctx.ledger.append("task.waiting", { taskId: task.id, waitingFor: [taskId], reason: waitingReason(taskId, reason) });
  }
}

function cancelled(report: PoolTaskReport): PoolTaskReport {
  return { ...report, status: "cancelled", reason: "run cancelled" };
}

export async function runOneTask(task: TaskContract, ctx: PoolContext, isolate: boolean): Promise<PoolTaskReport> {
  const counts: RetryCounts = { transient: 0, publish: 0 };
  let note = "";
  let retryIndex = 0;
  for (;;) {
    const report = await attemptTask(notedTask(task, note), ctx, { isolate, quiet: true, retryIndex });
    if (ctx.signal.aborted) return finish(ctx, report.status === "cancelled" ? report : cancelled(report));
    const decision = decideRetry(report, counts, falseMissing(report, task.id, ctx));
    if (decision.action === "settle") return finish(ctx, report);
    if (decision.kind === "transient") counts.transient += 1;
    else counts.publish += 1;
    note = decision.note;
    retryIndex += 1;
    const attempt = counts.transient + counts.publish;
    ctx.ledger.append("task.retrying", {
      taskId: task.id,
      attempt,
      maxAttempts: MAX_TRANSIENT_RETRIES + MAX_PUBLISH_RETRIES,
      delayMs: decision.delayMs,
      reason: decision.reason,
    });
    tellWaiters(task.id, decision.reason, ctx);
    await delay(decision.delayMs, ctx.signal);
    if (ctx.signal.aborted) return finish(ctx, cancelled(report));
  }
}

function falseMissing(report: PoolTaskReport, taskId: string, ctx: PoolContext): readonly string[] {
  return report.status === "ok" ? missingOutputs(taskId, ctx) : [];
}

function finish(ctx: PoolContext, report: PoolTaskReport): PoolTaskReport {
  const { taskId, status, reason, installMs, agentMs, wallMs, isRejected } = report;
  if (status === "skipped") return report;
  ctx.ledger.append("pool.task.settled", { taskId, status, reason, installMs, agentMs, wallMs, ...(isRejected ? { rejected: true } : {}) });
  return report;
}
