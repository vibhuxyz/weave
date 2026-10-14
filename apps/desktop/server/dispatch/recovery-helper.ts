import type { Ledger, TasksStore } from "@weave/core";
import { createRecoveryCheckpoint } from "@weave/core";
import type { CheckpointReason, ExecutionPhase, RecoveryAction, RecoveryReason } from "@weave/protocol";
import type { DesktopSessionManager } from "../session/index.ts";

export interface RecoveryContext {
  readonly weaveDir: string;
  readonly cwd: string;
  readonly taskId: string;
  readonly runId: string;
  readonly goal: string;
  readonly tasksStore: TasksStore;
  readonly ledger: Ledger;
  readonly sessionId: string;
}

export function createRecoveryContext(
  sessionMgr: DesktopSessionManager,
  cwd: string,
  taskId: string,
  ledger: Ledger,
  tasksStore: TasksStore,
  sessionId: string,
): RecoveryContext {
  return {
    weaveDir: sessionMgr.dataDir,
    cwd,
    taskId,
    runId: ledger.runId,
    goal: sessionMgr.taskGoal,
    tasksStore,
    ledger,
    sessionId,
  };
}

export interface RecoveryDecisionParams {
  readonly checkpointReason: CheckpointReason;
  readonly attempt: number;
  readonly reason: RecoveryReason;
  readonly phase: ExecutionPhase;
  readonly action: RecoveryAction;
}

export async function persistRecoveryDecision(
  ctx: RecoveryContext,
  params: RecoveryDecisionParams,
): Promise<string | undefined> {
  let checkpointId: string | undefined;
  try {
    const checkpoint = await createRecoveryCheckpoint({
      weaveDir: ctx.weaveDir,
      cwd: ctx.cwd,
      taskId: ctx.taskId,
      runId: ctx.runId,
      goal: ctx.goal,
      reason: params.checkpointReason,
      tasksStore: ctx.tasksStore,
    });
    checkpointId = checkpoint.id;
  } catch {
  }

  ctx.ledger.append("recovery.decided", {
    workSessionId: ctx.sessionId,
    attempt: params.attempt,
    reason: params.reason,
    phase: params.phase,
    action: params.action,
    ...(checkpointId ? { checkpointId } : {}),
  });

  return checkpointId;
}
