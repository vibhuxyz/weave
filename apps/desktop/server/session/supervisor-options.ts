import {
  confineToTaskDir,
  describeCapabilityMismatch,
  getEngine,
  type CreateSupervisorOptions,
} from "@weave/agent";
import { readGitStatus, type Ledger } from "@weave/core";
import type { SessionConfigOption, SessionUpdate } from "@weave/protocol";
import type { SessionContext } from "./types.ts";

export interface CreateSupervisorInputs {
  readonly ctx: SessionContext;
  readonly getCurrentEngineId: () => string;
  readonly onSessionReady: (sessionId: string, resumed: boolean, configOptions: readonly SessionConfigOption[]) => void;
  readonly resumeId: string | null;
}

export function createSupervisorOptions({
  ctx,
  getCurrentEngineId,
  onSessionReady,
  resumeId,
}: CreateSupervisorInputs): Omit<CreateSupervisorOptions, "engineId"> {
  const { task, projectDir, ledger, send } = ctx;

  return {
    task,
    policy: confineToTaskDir,
    resumeSessionId: resumeId,
    sink: {
      onSpawned: (pid: number, entry: string) =>
        ledger.append("agent.spawned", { taskId: task.id, pid, entry }),
      onSession: (sessionId: string, resumed: boolean, configOptions: readonly SessionConfigOption[]) => {
        ledger.append("agent.session", {
          taskId: task.id,
          sessionId,
          resumed,
          configOptions: [...configOptions],
        });
        onSessionReady(sessionId, resumed, configOptions);
        readGitStatus(projectDir)
          .then((git) => send({ type: "git-status", git }))
          .catch((error: unknown) => {
            ledger.append("error", {
              taskId: task.id,
              where: "git-status",
              message: error instanceof Error ? error.message : String(error),
            });
          });
      },
      onUpdate: (update: SessionUpdate, replay?: boolean) => {
        const event = ledger.append("agent.message", { taskId: task.id, update });
        send({
          type: "update",
          update,
          replay,
          source: { runId: event.runId, seq: event.seq },
        });
      },
      onPermission: (toolCall: string, options: Array<{ optionId: string; name: string; kind: string }>, decision: { decision: "allow" | "reject"; optionId?: string; reason: string }) => {
        ledger.append("permission.requested", { taskId: task.id, toolCall, options });
        ledger.append("permission.decided", {
          taskId: task.id,
          toolCall,
          decision: decision.decision,
          optionId: decision.optionId,
          reason: decision.reason,
        });
      },
      onFileRead: (path: string) => ledger.append("file.read", { taskId: task.id, path }),
      onFileWritten: (path: string, bytes: number) =>
        ledger.append("file.written", { taskId: task.id, path, bytes }),
      onCapabilities: (capabilities: unknown) => {
        const engineId = getCurrentEngineId();
        ledger.append("engine.capabilities", {
          taskId: task.id,
          engineId,
          capabilities,
        });
        const mismatch = describeCapabilityMismatch(
          getEngine(engineId).capabilities,
          capabilities,
        );
        if (mismatch) {
          ledger.append("error", { taskId: task.id, where: "engine.capabilities", message: mismatch });
        }
      },
    },
  };
}
