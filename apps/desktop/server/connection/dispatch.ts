import { readGitStatus } from "@weave/core";
import { readAttachment, searchProjectFiles } from "../project/index.ts";
import { handleStartAuth, toAuthInputLine } from "../auth/index.ts";
import { handleStartSetup } from "../dispatch/index.ts";
import { handleCompact, handleSaveHistory, handlePrompt, handleNewChat, handleOpenChat, handleSwitchEngine, handleSetConfig, handleSetMode } from "../dispatch/index.ts";
import { errorMessage } from "../shared/index.ts";
import { parseProjectDirs } from "../chat/index.ts";
import { handleChatAction, handleDeleteProject, parseAutoArchiveDays } from "../archive/index.ts";
import type { ChatAction } from "../archive/index.ts";
import { createCheckpointTask, runCancelCheckpoint } from "./checkpoint-task.ts";
import { answerQuestion } from "../questions/index.ts";
import { saveAnswer } from "../decisions/index.ts";
import { forwardResult } from "./forward-result.ts";
import type { ClientMessageContext } from "./types.ts";
import type { ClientMessage } from "../shared/index.ts";

const CHAT_ACTIONS: Readonly<Record<"archive-chat" | "restore-chat" | "delete-chat", ChatAction>> = {
  "archive-chat": "archive",
  "restore-chat": "restore",
  "delete-chat": "delete",
};

export function handleClientMessage(
  msg: ClientMessage,
  ctx: ClientMessageContext,
  queueTask: (fn: () => Promise<unknown>) => void,
): void {
  const {
    sessionMgr,
    projectDir,
    dataDir,
    chats,
    directory,
    autoArchive,
    weaveHome,
    tasksStore,
    ledger,
    continuationTaskId,
    ruleCatalog,
    builtinSkillCatalog,
    skillCatalog,
    pluginsById,
    authMethodsByEngine,
    pendingPermissions,
    pendingQuestions,
    decisions,
    activeSetup,
    compaction,
    history,
    send,
    sendChats,
    sendEngineList,
    loadPlugins,
    getAuthSession,
    setAuthSession,
    publishAuth,
  } = ctx;

  const checkpointTask = createCheckpointTask({ sessionMgr, projectDir, dataDir, continuationTaskId, ledger, tasksStore });

  switch (msg.type) {
    case "cancel":
      // Release anything the agent is blocked on first: a cancel with a
      // permission card still open would otherwise leave the engine waiting
      // on a response that is never coming.
      for (const requestId of pendingPermissions.cancelAll()) {
        send({ type: "permission-cancelled", requestId });
      }
      pendingQuestions.cancelAll();
      runCancelCheckpoint(checkpointTask, sessionMgr, send);
      return;

    case "permission-response":
      pendingPermissions.resolve(msg.requestId, msg.optionId);
      return;

    case "question-response":
      answerQuestion({
        pending: pendingQuestions,
        requestId: msg.requestId,
        answers: msg.answers,
        send,
        onAnswered: (answered) => saveAnswer(decisions, { ...answered, engineId: sessionMgr.currentEngineId }, send),
      });
      return;

    case "set-mode":
      queueTask(() => handleSetMode({ modeId: msg.modeId, sessionMgr, send }));
      return;

    case "start-setup":
      handleStartSetup({ engineId: msg.engineId, projectDir, activeSetup, send, queueTask });
      return;

    case "cancel-setup":
      activeSetup.cancel();
      return;

    case "submit-setup-key":
      activeSetup.sendKey(msg.key);
      return;

    case "submit-setup-consent":
      activeSetup.submitConsent(msg.agreed);
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

    case "submit-auth-input": {
      const text = toAuthInputLine(msg.text);
      if (text) getAuthSession()?.submitInput?.(text);
      return;
    }

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
      handleSetConfig({ sessionMgr, compaction, configId: msg.configId, value: msg.value, send });
      return;

    case "new-chat":
      queueTask(() => handleNewChat({ instructions: msg.instructions, sessionMgr, projectDir, send, sendChats }));
      return;

    case "open-chat":
      queueTask(() => handleOpenChat({ sessionId: msg.sessionId, sessionMgr, projectDir, chats, send, sendChats }));
      return;

    case "compact": {
      const { operationId } = msg;
      if (typeof operationId !== "string" || operationId.length === 0) {
        send({ type: "error", message: "Cannot compact: the request has no operationId." });
        return;
      }
      queueTask(() => handleCompact({ operationId, projectDir, sessionMgr, compaction, send }));
      return;
    }

    case "list-project-chats": {
      const projectDirs = parseProjectDirs(msg.projectDirs);
      const archived = autoArchive.run(sessionMgr.supervisor?.current.sessionId ?? null);
      if (!archived.ok) send({ type: "error", message: `Automatic archiving skipped: ${archived.reason}` });
      void directory.listForFolders(projectDirs).then(
        (listing) => send({ type: "project-chats", ...listing }),
        (error: unknown) => send({ type: "error", message: `Cannot list project chats: ${errorMessage(error)}` }),
      );
      return;
    }

    case "archive-chat":
    case "restore-chat":
    case "delete-chat":
      queueTask(() =>
        handleChatAction(CHAT_ACTIONS[msg.type], msg, {
          directory,
          currentSessionId: () => sessionMgr.supervisor?.current.sessionId ?? null,
          now: Date.now,
          send,
          sendChats,
          startNewChat: () => handleNewChat({ sessionMgr, projectDir, send, sendChats }),
        }),
      );
      return;

    case "delete-project":
      queueTask(() =>
        handleDeleteProject(msg, { directory, currentProjectId: chats.projectId, weaveHome, send }),
      );
      return;

    case "set-auto-archive": {
      const days = parseAutoArchiveDays(msg.afterDays);
      if (days === undefined) {
        send({ type: "error", message: `Cannot set automatic archiving to ${String(msg.afterDays)} days.` });
        return;
      }
      autoArchive.setAfterDays(days);
      send({ type: "archive-settings", autoArchiveAfterDays: days });
      return;
    }

    case "save-history":
      queueTask(async () => handleSaveHistory({ raw: msg, history, send }));
      return;

    case "prompt":
      queueTask(() =>
        handlePrompt({
          msg,
          sessionMgr,
          compaction,
          projectDir,
          pluginsById,
          ledger,
          tasksStore,
          chats,
          continuationTaskId,
          ruleCatalog,
          builtinSkillCatalog,
          skillCatalog,
          decisions,
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
