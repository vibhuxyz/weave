import { ENGINES, getEngine } from "@weave/agent";
import type { DesktopSessionManager } from "../session/index.ts";
import type { ServerMessage } from "../shared/index.ts";
import type { CheckpointReason } from "@weave/protocol";
import type { Checkpoint } from "@weave/core";

export interface SwitchEngineOptions {
  readonly nextId: string;
  readonly sessionMgr: DesktopSessionManager;
  readonly projectDir: string;
  readonly send: (msg: ServerMessage) => void;
  readonly checkpointTask: (reason: CheckpointReason, cancel?: () => Promise<void> | void) => Promise<Checkpoint | null>;
  readonly queueTask: (fn: () => Promise<unknown>) => void;
}

export function handleSwitchEngine({
  nextId,
  sessionMgr,
  projectDir,
  send,
  checkpointTask,
  queueTask,
}: SwitchEngineOptions): void {
  const target = ENGINES[nextId as keyof typeof ENGINES];
  if (!target) {
    send({ type: "error", message: `Unknown engine: ${nextId}` });
    return;
  }

  if (nextId === sessionMgr.currentEngineId) {
    if (sessionMgr.supervisor?.current) {
      send({
        type: "ready",
        sessionId: sessionMgr.supervisor.current.sessionId,
        cwd: projectDir,
        engineId: sessionMgr.currentEngineId,
        engineLabel: getEngine(sessionMgr.currentEngineId).label,
        configOptions: sessionMgr.supervisor.current.configOptions,
        modes: sessionMgr.supervisor.current.modes,
        resumed: true,
      });
    }
    return;
  }

function proceedDespiteCancelFailure(): void {
  return undefined;
}

  queueTask(async () => {
    try {
      await checkpointTask("explicit_handoff", () =>
        sessionMgr.supervisor?.current?.cancel().catch(proceedDespiteCancelFailure),
      );
      await sessionMgr.bindEngine(nextId);
    } catch (err: unknown) {
      if (sessionMgr.handleAuthError(err, nextId)) return;
      send({
        type: "error",
        message: `Could not switch engine: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });
}
