import {
  createGuardedPermissionPolicy,
  describeCapabilityMismatch,
  getEngine,
  type CreateSupervisorOptions,
} from "@weave/agent";
import { readGitStatus, type Ledger } from "@weave/core";
import type { SessionConfigOption, SessionUpdate } from "@weave/protocol";
import type { SessionModes } from "@weave/agent";
import { createUserPrompter } from "../permissions/index.ts";
import { createUserAsker } from "../questions/index.ts";
import type { SessionContext } from "./types.ts";

export interface CreateSupervisorInputs {
  readonly ctx: SessionContext;
  readonly getCurrentEngineId: () => string;
  /** The live session mode, so plan mode is enforced per tool call. */
  readonly getCurrentModeId: () => string | null;
  readonly onSessionReady: (
    sessionId: string,
    resumed: boolean,
    configOptions: readonly SessionConfigOption[],
    modes: SessionModes | null,
  ) => void;
  readonly resumeId: string | null;
}

export function createSupervisorOptions({
  ctx,
  getCurrentEngineId,
  getCurrentModeId,
  onSessionReady,
  resumeId,
}: CreateSupervisorInputs): Omit<CreateSupervisorOptions, "engineId"> {
  const { task, projectDir, ledger, send, pendingPermissions, pendingQuestions, compaction, replayGate } = ctx;

  return {
    task,
    policy: createGuardedPermissionPolicy(
      createUserPrompter({ pending: pendingPermissions, send }),
      { currentModeId: getCurrentModeId },
    ),
    askUser: createUserAsker({ pending: pendingQuestions, send }),
    resumeSessionId: resumeId,
    sink: {
      onSpawned: (pid: number, entry: string) =>
        ledger.append("agent.spawned", { taskId: task.id, pid, entry }),
      onSession: (
        sessionId: string,
        resumed: boolean,
        configOptions: readonly SessionConfigOption[],
        modes: SessionModes | null,
      ) => {
        ledger.append("agent.session", {
          taskId: task.id,
          sessionId,
          resumed,
          configOptions: [...configOptions],
        });
        onSessionReady(sessionId, resumed, configOptions, modes);
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
      onUpdate: (update: SessionUpdate, replay?: boolean, sessionId?: string) => {
        compaction.observe(update, { sessionId, isReplay: replay === true });
        if (replay) {
          const decision = replayGate.filter(update, sessionId);
          for (const message of decision.messages) send(message);
          if (!decision.forward) return;
        }
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
      onPolicyBlock: (block: { toolCallId: string; title: string; reason: string }) =>
        send({ type: "policy-block", ...block }),
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
