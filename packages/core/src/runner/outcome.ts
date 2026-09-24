import type { TaskResult, Usage, Verification } from "@weave/protocol";
import { finalMessageOf, type RunTaskTracker } from "./sink.ts";
import type { RunTaskContext, RunTaskOutcome, Session } from "./types.ts";
import type { Worktree } from "../worktree/index.ts";

export interface SuccessOutcomeInput {
  ctx: RunTaskContext;
  session: Session;
  tracker: RunTaskTracker;
  stopReason: string;
  turnUsage: Usage | null | undefined;
  wallMs: number;
  filesChanged: string[];
  verification: Verification | undefined;
  worktree: Worktree | null;
}

export function buildSuccessOutcome(input: SuccessOutcomeInput): RunTaskOutcome {
  const { ctx, session, tracker, stopReason, turnUsage, wallMs, filesChanged, verification, worktree } = input;
  const status = tracker.stopped ? "cancelled" : "ok";
  const result: TaskResult = {
    taskId: ctx.task.id,
    status,
    stopReason,
    wallMs,
    filesWritten: session.filesWritten(),
    filesChanged,
    verification,
  };
  ctx.emit(ctx.ledger.append("task.finished", { taskId: ctx.task.id, status, stopReason, wallMs }));

  return {
    result,
    runId: ctx.ledger.runId,
    ledgerFile: ctx.ledger.file,
    sessionId: session.sessionId,
    turns: tracker.turns,
    costUsd: tracker.costUsd,
    contextUsed: tracker.contextUsed,
    contextSize: tracker.contextSize,
    turnUsage,
    worktree,
    finalMessage: finalMessageOf(tracker),
    stoppedBy: tracker.stopped,
  };
}

export interface FailureOutcomeInput {
  ctx: RunTaskContext;
  session: Session | null;
  tracker: RunTaskTracker;
  error: unknown;
  wallMs: number;
  worktree: Worktree | null;
}

export function buildFailureOutcome(input: FailureOutcomeInput): RunTaskOutcome {
  const { ctx, session, tracker, error, wallMs, worktree } = input;
  const message = error instanceof Error ? error.message : String(error);
  ctx.emit(ctx.ledger.append("error", { taskId: ctx.task.id, where: "runTask", message }));
  ctx.emit(ctx.ledger.append("task.finished", { taskId: ctx.task.id, status: "failed", wallMs }));

  return {
    result: {
      taskId: ctx.task.id,
      status: "failed",
      wallMs,
      filesWritten: session?.filesWritten() ?? [],
      filesChanged: [],
      error: message,
    },
    runId: ctx.ledger.runId,
    ledgerFile: ctx.ledger.file,
    sessionId: session?.sessionId ?? "",
    turns: tracker.turns,
    costUsd: tracker.costUsd,
    contextUsed: tracker.contextUsed,
    contextSize: tracker.contextSize,
    turnUsage: null,
    worktree,
    finalMessage: finalMessageOf(tracker),
    stoppedBy: tracker.stopped,
  };
}
