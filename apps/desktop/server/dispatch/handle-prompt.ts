import { titleFromPrompt, readGitStatus } from "@weave/core";
import { resolveSessionPlugins, composeSystemPrompt, buildPromptBlocks } from "../chat/index.ts";
import type { DesktopSessionManager } from "../session/index.ts";
import type { ClientMessage, ServerMessage } from "../shared/index.ts";
import type { Ledger, TasksStore, ConversationStore, SessionStore, NormalizedPlugin } from "@weave/core";

export interface PromptOptions {
  readonly msg: Extract<ClientMessage, { readonly type: "prompt" }>;
  readonly sessionMgr: DesktopSessionManager;
  readonly projectDir: string;
  readonly pluginsById: ReadonlyMap<string, NormalizedPlugin>;
  readonly ledger: Ledger;
  readonly tasksStore: TasksStore;
  readonly conversations: ConversationStore;
  readonly store: SessionStore;
  readonly continuationTaskId: string;
  readonly ruleCatalog: string;
  readonly builtinSkillCatalog: string;
  readonly skillCatalog: string;
  readonly send: (msg: ServerMessage) => void;
  readonly sendChats: () => Promise<void>;
}

export async function handlePrompt({
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
}: Readonly<PromptOptions>): Promise<void> {
  if (!sessionMgr.supervisor) {
    send({
      type: "error",
      message: "Please sign in to the AI engine before sending a message.",
    });
    return;
  }

  const text = msg.text;
  const isFirstPrompt = !sessionMgr.taskCreated;
  if (isFirstPrompt) {
    sessionMgr.taskCreated = true;
    sessionMgr.taskGoal = text;
  }

  const pluginBlock = resolveSessionPlugins({
    refs: msg.plugins,
    currentEngineId: sessionMgr.currentEngineId,
    pluginsById,
    ledger,
    taskId: "desktop",
  });

  const outgoing = composeSystemPrompt(text, {
    pendingPreamble: sessionMgr.pendingPreamble,
    persona: msg.persona,
    pluginBlock,
    ruleCatalog,
    builtinSkillCatalog,
    skillCatalog,
  });
  sessionMgr.pendingPreamble = null;

  const blocks = buildPromptBlocks(outgoing, msg.images);

  try {
    if (isFirstPrompt) {
      await tasksStore.create(
        continuationTaskId,
        sessionMgr.taskGoal,
        projectDir,
        sessionMgr.currentEngineId,
        sessionMgr.supervisor.current.sessionId,
        ledger.runId,
        ledger.seq,
      );
      ledger.append("attempt.started", {
        taskId: continuationTaskId,
        attemptIndex: 0,
        engineId: sessionMgr.currentEngineId,
        sessionId: sessionMgr.supervisor.current.sessionId,
      });
    }

    const { stopReason, usage } = await sessionMgr.supervisor.current.prompt([...blocks]);

    send({ type: "turn-end", stopReason, usage });
    ledger.append("task.finished", {
      taskId: "desktop",
      status: "ok",
      stopReason,
      wallMs: 0,
    });

    if (!sessionMgr.persisted) {
      sessionMgr.persisted = true;
      await store.set(projectDir, sessionMgr.supervisor.current.sessionId);
    }
    await conversations.record(
      sessionMgr.supervisor.current.sessionId,
      titleFromPrompt(text),
    );
    await sendChats();
    send({ type: "git-status", git: await readGitStatus(projectDir) });
  } catch (err: unknown) {
    if (sessionMgr.handleAuthError(err, sessionMgr.currentEngineId)) return;
    const errMsg = err instanceof Error ? err.message : String(err);
    ledger.append("error", { taskId: "desktop", where: "prompt", message: errMsg });
    send({ type: "error", message: errMsg });
  }
}
