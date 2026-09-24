import { titleFromPrompt, readGitStatus } from "@weave/core";
import { EngineStalledError } from "@weave/agent";
import { resolveSessionPlugins, composeSystemPrompt, buildPromptBlocks, parsePersonaIds } from "../chat/index.ts";
import { compactBeforePrompt } from "../compaction/index.ts";
import type { CompactionController } from "../compaction/index.ts";
import { summaryReaderFor } from "../history/index.ts";
import type { DesktopSessionManager } from "../session/index.ts";
import type { ClientMessage, ServerMessage } from "../shared/index.ts";
import type { Ledger, TasksStore, NormalizedPlugin } from "@weave/core";
import type { ProjectChats } from "../chat/index.ts";
import type { DecisionLog } from "../decisions/index.ts";

export interface PromptOptions {
  readonly msg: Extract<ClientMessage, { readonly type: "prompt" }>;
  readonly sessionMgr: DesktopSessionManager;
  readonly compaction: CompactionController;
  readonly projectDir: string;
  readonly pluginsById: ReadonlyMap<string, NormalizedPlugin>;
  readonly ledger: Ledger;
  readonly tasksStore: TasksStore;
  readonly chats: ProjectChats;
  readonly continuationTaskId: string;
  readonly ruleCatalog: string;
  readonly builtinSkillCatalog: string;
  readonly skillCatalog: string;
  readonly decisions: DecisionLog;
  readonly send: (msg: ServerMessage) => void;
  readonly sendChats: () => Promise<void>;
}

export async function handlePrompt({
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
}: Readonly<PromptOptions>): Promise<void> {
  if (!sessionMgr.supervisor) {
    send({
      type: "error",
      message: "Please sign in to the AI engine before sending a message.",
    });
    return;
  }

  // A stalled engine was killed mid-turn; give this prompt a live one rather
  // than writing into a dead process's stdin.
  try {
    await sessionMgr.supervisor.reviveCurrent();
  } catch (err: unknown) {
    if (sessionMgr.handleAuthError(err, sessionMgr.currentEngineId)) return;
    send({
      type: "error",
      message: `Could not start ${sessionMgr.currentEngineId}: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  const preflight = await compactBeforePrompt({
    controller: compaction,
    session: sessionMgr.supervisor.current,
    promptId: msg.promptId,
    threshold: msg.autoCompactThreshold,
    send,
    readSummary: summaryReaderFor(sessionMgr.currentEngineId, projectDir),
  });
  if (preflight.kind === "withdrawn") return;
  if (preflight.error) {
    if (sessionMgr.handleAuthError(preflight.error, sessionMgr.currentEngineId)) return;
    try {
      await sessionMgr.supervisor.reviveCurrent();
    } catch (err: unknown) {
      if (sessionMgr.handleAuthError(err, sessionMgr.currentEngineId)) return;
      send({ type: "turn-end", stopReason: "stalled" });
      send({
        type: "error",
        message: `Could not restart ${sessionMgr.currentEngineId} after compaction failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
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
    decisionsBlock: decisions.formatBlock(),
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
    compaction.recordTurnCompleted(sessionMgr.supervisor.current.sessionId);
    ledger.append("task.finished", {
      taskId: "desktop",
      status: "ok",
      stopReason,
      wallMs: 0,
    });

    const sessionId = sessionMgr.supervisor.current.sessionId;
    const recorded = chats.record(sessionId, {
      title: titleFromPrompt(text),
      engineId: sessionMgr.currentEngineId,
      personaIds: parsePersonaIds(msg.personaIds),
    });
    if (!recorded.ok) send({ type: "error", message: `Cannot save this chat: ${recorded.reason}` });
    if (recorded.ok && !sessionMgr.persisted) {
      sessionMgr.persisted = true;
      chats.rememberLastSession(sessionId);
    }
    await sendChats();
    send({ type: "git-status", git: await readGitStatus(projectDir) });
  } catch (err: unknown) {
    if (sessionMgr.handleAuthError(err, sessionMgr.currentEngineId)) return;
    const errMsg = err instanceof Error ? err.message : String(err);
    ledger.append("error", {
      taskId: "desktop",
      where: err instanceof EngineStalledError ? "engine.stalled" : "prompt",
      message: errMsg,
    });
    send({ type: "turn-end", stopReason: "stalled" });
    send({ type: "error", message: errMsg });
  }
}
