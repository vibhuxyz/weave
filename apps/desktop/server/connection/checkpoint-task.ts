import { runStopSequence, weaveDirFor } from "@weave/core";
import { summarizeCheckpoint } from "../chat/index.ts";
import { errorMessage } from "../shared/index.ts";
import type { DesktopSessionManager } from "../session/index.ts";
import type { ServerMessage } from "../shared/index.ts";
import type { Checkpoint, Ledger, TasksStore } from "@weave/core";
import type { CheckpointReason } from "@weave/protocol";

export type CheckpointTask = (
  reason: CheckpointReason,
  cancel?: () => Promise<void> | void,
) => Promise<Checkpoint | null>;

export interface CheckpointTaskDeps {
  readonly sessionMgr: DesktopSessionManager;
  readonly projectDir: string;
  readonly continuationTaskId: string;
  readonly ledger: Ledger;
  readonly tasksStore: TasksStore;
}

export function createCheckpointTask(deps: CheckpointTaskDeps): CheckpointTask {
  const { sessionMgr, projectDir, continuationTaskId, ledger, tasksStore } = deps;
  return async (reason, cancel) => {
    if (!sessionMgr.taskCreated) {
      await cancel?.();
      return null;
    }
    const { checkpoint } = await runStopSequence({
      weaveDir: weaveDirFor(projectDir),
      cwd: projectDir,
      taskId: continuationTaskId,
      runId: ledger.runId,
      goal: sessionMgr.taskGoal,
      reason,
      tasksStore,
      cancel,
    });
    ledger.append("checkpoint.created", {
      taskId: continuationTaskId,
      checkpointId: checkpoint.id,
      atSeq: checkpoint.seq,
      reason: checkpoint.reason,
    });
    return checkpoint;
  };
}

export function runCancelCheckpoint(
  checkpointTask: CheckpointTask,
  sessionMgr: DesktopSessionManager,
  send: (msg: ServerMessage) => void,
): void {
  void checkpointTask("user_cancellation", () => sessionMgr.supervisor?.current?.cancel())
    .then((cp) => {
      if (cp) send({ type: "checkpoint", ...summarizeCheckpoint(cp) });
    })
    .catch((err: unknown) => {
      send({ type: "error", message: `Checkpoint failed: ${errorMessage(err)}` });
    });
}
