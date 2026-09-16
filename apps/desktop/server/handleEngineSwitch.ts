import { ENGINES, getEngine } from "@weave/agent";
import type { DesktopSessionManager } from "./sessionManager.ts";
import type { ServerMessage } from "./server.types.ts";

export function handleSwitchEngine(options: {
  readonly nextId: string;
  readonly sessionMgr: DesktopSessionManager;
  readonly projectDir: string;
  readonly send: (msg: ServerMessage) => void;
  readonly checkpointTask: (reason: any, cancel?: any) => Promise<any>;
  readonly queueTask: (fn: () => Promise<unknown>) => void;
}): void {
  const { nextId, sessionMgr, projectDir, send, checkpointTask, queueTask } = options;

  if (!ENGINES[nextId]) {
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
        resumed: true,
      });
    }
    return;
  }

  queueTask(async () => {
    try {
      await checkpointTask("explicit_handoff", () =>
        sessionMgr.supervisor?.current?.cancel().catch(() => {}),
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
