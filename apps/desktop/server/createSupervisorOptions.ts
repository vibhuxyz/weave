import {
  confineToTaskDir,
  describeCapabilityMismatch,
  getEngine,
  type EngineSupervisor,
} from "@weave/agent";
import { readGitStatus } from "@weave/core";
import type { SessionContext } from "./sessionManager.types.ts";

export function createSupervisorOptions(
  ctx: SessionContext,
  getCurrentEngineId: () => string,
  onSessionReady: (sessionId: string, resumed: boolean, configOptions: any) => void,
  resumeId: string | null,
): Parameters<typeof import("@weave/agent").createEngineSupervisor>[0] {
  const { task, projectDir, ledger, send } = ctx;

  return {
    engineId: getCurrentEngineId(),
    task,
    policy: confineToTaskDir,
    resumeSessionId: resumeId,
    sink: {
      onSpawned: (pid: number, entry: string) =>
        ledger.append("agent.spawned", { taskId: task.id, pid, entry }),
      onSession: (sessionId: string, resumed: boolean, configOptions: any) => {
        ledger.append("agent.session", {
          taskId: task.id,
          sessionId,
          resumed,
          configOptions,
        });
        onSessionReady(sessionId, resumed, configOptions);
        void readGitStatus(projectDir).then((git) =>
          send({ type: "git-status", git }),
        );
      },
      onUpdate: (update: any, replay?: boolean) => {
        const event = ledger.append("agent.message", { taskId: task.id, update });
        send({
          type: "update",
          update,
          replay,
          source: { runId: event.runId, seq: event.seq },
        });
      },
      onPermission: (toolCall: any, options: any, decision: any) => {
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
      onCapabilities: (capabilities: any) => {
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
