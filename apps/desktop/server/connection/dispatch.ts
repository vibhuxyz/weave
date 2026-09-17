import { readGitStatus } from "@weave/core";
import { readAttachment, searchProjectFiles } from "../project/index.ts";
import { handleStartAuth } from "../auth/index.ts";
import { handlePrompt, handleNewChat, handleOpenChat, handleSwitchEngine, handleSetConfig } from "../dispatch/index.ts";
import { errorMessage } from "../shared/index.ts";
import { createCheckpointTask, runCancelCheckpoint } from "./checkpoint-task.ts";
import { forwardResult } from "./forward-result.ts";
import type { ClientMessageContext } from "./types.ts";
import type { ClientMessage } from "../shared/index.ts";

export function handleClientMessage(
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

  const checkpointTask = createCheckpointTask({ sessionMgr, projectDir, continuationTaskId, ledger, tasksStore });

  switch (msg.type) {
    case "cancel":
      runCancelCheckpoint(checkpointTask, sessionMgr, send);
      return;

    case "switch-engine":
      handleSwitchEngine({ nextId: msg.engineId, sessionMgr, projectDir, send, checkpointTask, queueTask });
      return;

    case "refresh-engines":
      sendEngineList();
      return;

    case "refresh-plugins":
      loadPlugins().catch((error: unknown) => {
        send({ type: "error", message: `Plugin refresh failed: ${errorMessage(error)}` });
      });
      return;

    case "cancel-auth":
      getAuthSession()?.abort.abort();
      return;

    case "start-auth":
      handleStartAuth({
        engineId: msg.engineId,
        methodId: msg.methodId,
        secret: msg.secret,
        projectDir,
        authMethodsByEngine,
        getAuthSession,
        setAuthSession,
        publishAuth,
        send,
        queueTask,
        getSupervisor: () => sessionMgr.supervisor,
        bindEngine: (id) => sessionMgr.bindEngine(id),
      });
      return;

    case "git":
      forwardResult(readGitStatus(projectDir), send, (git) => ({ type: "git-status", git }), "Git status failed");
      return;

    case "read-attachment":
      forwardResult(
        readAttachment(projectDir, msg.path),
        send,
        (dataUri) => ({ type: "attachment", path: msg.path, dataUri }),
        `Cannot read attachment ${msg.path}`,
      );
      return;

    case "list-files":
      forwardResult(
        searchProjectFiles(projectDir, msg.query),
        send,
        (files) => ({ type: "files", query: msg.query, files }),
        "File search failed",
      );
      return;

    case "set-config":
      handleSetConfig({ sessionMgr, configId: msg.configId, value: msg.value, send });
      return;

    case "new-chat":
      queueTask(() => handleNewChat({ instructions: msg.instructions, sessionMgr, projectDir, send, sendChats }));
      return;

    case "open-chat":
      queueTask(() => handleOpenChat({ sessionId: msg.sessionId, sessionMgr, projectDir, store, send, sendChats }));
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
        }),
      );
      return;

    default: {
      const exhaustive: never = msg;
      send({ type: "error", message: `Unknown message: ${JSON.stringify(exhaustive)}` });
      return;
    }
  }
}
