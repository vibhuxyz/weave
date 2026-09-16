import { readGitStatus, runStopSequence } from "@weave/core";
import type { CheckpointReason } from "@weave/protocol";
import { readAttachment } from "./readAttachment.ts";
import { searchProjectFiles } from "./searchProjectFiles.ts";
import { summarizeCheckpoint } from "./checkpointSummary.ts";
import { handlePrompt } from "./handlePrompt.ts";
import { handleNewChat, handleOpenChat } from "./handleChatNavigation.ts";
import { handleSwitchEngine } from "./handleEngineSwitch.ts";
import { handleStartAuth } from "./handleAuthSessionMessage.ts";
import type { ActiveAuthSession } from "./authHandler.ts";
import type { DesktopSessionManager } from "./sessionManager.ts";
import type { ClientMessage, ServerMessage } from "./server.types.ts";

export interface ClientMessageContext {
  readonly sessionMgr: DesktopSessionManager;
  readonly projectDir: string;
  readonly store: any;
  readonly tasksStore: any;
  readonly conversations: any;
  readonly ledger: any;
  readonly continuationTaskId: string;
  readonly ruleCatalog: string;
  readonly builtinSkillCatalog: string;
  readonly skillCatalog: string;
  readonly pluginsById: Map<string, any>;
  readonly authMethodsByEngine: Map<string, any>;
  readonly send: (msg: ServerMessage) => void;
  readonly sendChats: () => Promise<void>;
  readonly sendEngineList: () => void;
  readonly loadPlugins: () => Promise<void>;
  readonly getAuthSession: () => ActiveAuthSession | null;
  readonly setAuthSession: (session: ActiveAuthSession | null) => void;
  readonly publishAuth: (patch: Partial<ActiveAuthSession["operation"]>) => void;
}

export function dispatchClientMessage(
  msg: ClientMessage,
  ctx: ClientMessageContext,
  queueTask: (fn: () => Promise<unknown>) => void,
): void {
  const {
    sessionMgr,
    projectDir,
    store,
    tasksStore,
    conversations,
    ledger,
    continuationTaskId,
    ruleCatalog,
    builtinSkillCatalog,
    skillCatalog,
    pluginsById,
    authMethodsByEngine,
    send,
    sendChats,
    sendEngineList,
    loadPlugins,
    getAuthSession,
    setAuthSession,
    publishAuth,
  } = ctx;

  const checkpointTask = async (
    reason: CheckpointReason,
    cancel?: () => Promise<void> | void,
  ) => {
    if (!sessionMgr.taskCreated) {
      await cancel?.();
      return null;
    }
    const { checkpoint } = await runStopSequence({
      weaveDir: tasksStore.weaveDir,
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

  switch (msg.type) {
    case "cancel":
      void checkpointTask("user_cancellation", () =>
        sessionMgr.supervisor?.current?.cancel(),
      )
        .then((cp) => {
          if (cp) send({ type: "checkpoint", ...summarizeCheckpoint(cp) });
        })
        .catch((err: unknown) =>
          send({
            type: "error",
            message: `Checkpoint failed: ${err instanceof Error ? err.message : String(err)}`,
          }),
        );
      return;

    case "switch-engine":
      handleSwitchEngine({
        nextId: msg.engineId,
        sessionMgr,
        projectDir,
        send,
        checkpointTask,
        queueTask,
      });
      return;

    case "refresh-engines":
      sendEngineList();
      return;

    case "refresh-plugins":
      void loadPlugins();
      return;

    case "cancel-auth":
      getAuthSession()?.abort.abort();
      return;

    case "start-auth":
      handleStartAuth({
        engineId: msg.engineId,
        methodId: msg.methodId,
        secret: msg.secret,
        sessionMgr,
        projectDir,
        authMethodsByEngine,
        getAuthSession,
        setAuthSession,
        publishAuth,
        send,
        queueTask,
      });
      return;

    case "git":
      void readGitStatus(projectDir).then((git) => send({ type: "git-status", git }));
      return;

    case "read-attachment":
      void readAttachment(projectDir, msg.path).then((dataUri) =>
        send({ type: "attachment", path: msg.path, dataUri }),
      );
      return;

    case "list-files":
      void searchProjectFiles(projectDir, msg.query).then((files) =>
        send({ type: "files", query: msg.query, files }),
      );
      return;

    case "set-config":
      if (!sessionMgr.supervisor) return;
      sessionMgr.supervisor.current
        .setConfigOption(msg.configId, msg.value)
        .then(() =>
          send({
            type: "config-changed",
            configId: msg.configId,
            value: msg.value,
          }),
        )
        .catch(() =>
          send({
            type: "config-rejected",
            configId: msg.configId,
            message: `"${msg.configId}" is not available for the current model.`,
          }),
        );
      return;

    case "new-chat":
      queueTask(() =>
        handleNewChat({
          instructions: msg.instructions,
          sessionMgr,
          projectDir,
          send,
          sendChats,
        }),
      );
      return;

    case "open-chat":
      queueTask(() =>
        handleOpenChat({
          sessionId: msg.sessionId,
          sessionMgr,
          projectDir,
          store,
          send,
          sendChats,
        }),
      );
      return;

    case "prompt":
      queueTask(() =>
        handlePrompt({
          msg,
          sessionMgr,
          projectDir,
          pluginsById,
          ledger,
          tasksStore,
          conversations,
          store,
          continuationTaskId,
          ruleCatalog,
          builtinSkillCatalog,
          skillCatalog,
          send,
          sendChats,
          authMethodsByEngine,
        }),
      );
      return;
  }
}
