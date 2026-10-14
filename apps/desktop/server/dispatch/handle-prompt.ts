import { titleFromPrompt, readGitStatus, TEAM_HANDOFF_SECTION, unclosedHandoff } from "@weave/core";
import { EngineStalledError } from "@weave/agent";
import { resolveSessionPlugins, composeSystemPrompt, buildPromptBlocks, parsePersonaIds } from "../chat/index.ts";
import { compactBeforePrompt } from "../compaction/index.ts";
import type { CompactionController } from "../compaction/index.ts";
import { summaryReaderFor } from "../history/index.ts";
import type { DesktopSessionManager } from "../session/index.ts";
import type { ClientMessage, ServerMessage } from "../shared/index.ts";
import type { Ledger, TasksStore, NormalizedPlugin } from "@weave/core";
import type { ProjectChats, SkillSelector } from "../chat/index.ts";
import type { DecisionLog } from "../decisions/index.ts";
import { errorMessage } from "../shared/index.ts";
import { continuationPrompt, promptUntilAnswer, watchUnfinished } from "./continue-unfinished.ts";
import { createRecoveryContext, persistRecoveryDecision } from "./recovery-helper.ts";
import { CHAT_TASK_ID, handoffWhenClosed, promptMayHandOff, watchTurn, type TeamRunStart } from "../team-handoff/index.ts";
import type { TurnEstimates, TurnHandoff } from "../team-tools/index.ts";

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
  readonly selectBuiltinSkills: SkillSelector;
  readonly skillCatalog: string;
  readonly decisions: DecisionLog;
  readonly send: (msg: ServerMessage) => void;
  readonly sendChats: () => Promise<void>;
  readonly startTeamRun: (start: TeamRunStart) => void;
  readonly teamEstimates: TurnEstimates & TurnHandoff;
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
  selectBuiltinSkills,
  skillCatalog,
  decisions,
  send,
  sendChats,
  startTeamRun,
  teamEstimates,
}: Readonly<PromptOptions>): Promise<void> {
  sessionMgr.cancelRequested = false;
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
  const canHandOff = promptMayHandOff(msg);
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
    builtinSkillCatalog: await selectBuiltinSkills(text),
    skillCatalog,
    teamHandoff: canHandOff ? TEAM_HANDOFF_SECTION : undefined,
  });
  sessionMgr.pendingPreamble = null;

  const blocks = buildPromptBlocks(outgoing, msg.images);
  if (canHandOff) {
    teamEstimates.clear();
    teamEstimates.clearHandoff();
    teamEstimates.allowHandoff(true);
  }
  const watch = canHandOff ? watchTurn(ledger, CHAT_TASK_ID) : null;
  const finishHandoff = watch === null ? null : handoffWhenClosed({
    watch, projectDir, request: text, images: msg.images, ledger, send, startTeamRun, teamEstimates,
  });
  const stopHandoffListen = watch === null ? null : teamEstimates.whenHandoff(() => { void finishHandoff?.(); });
  const warnUnclosed = (): void => {
    if (watch === null || teamEstimates.currentHandoff() !== null || !unclosedHandoff(watch.read())) return;
    send({ type: "error", message: "The agent opened a weave-handoff block and never closed it, so no workers were added. This chat keeps the work." });
  };
  const unfinished = watchUnfinished(ledger, CHAT_TASK_ID);

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

    const session = sessionMgr.supervisor.current;
    const recCtx = createRecoveryContext(sessionMgr, projectDir, continuationTaskId, ledger, tasksStore, session.sessionId);
    const finished = await promptUntilAnswer({
      run: (promptBlocks) => session.prompt([...promptBlocks]),
      first: blocks,
      followUp: (attempt) => buildPromptBlocks(continuationPrompt(attempt)),
      activity: unfinished,
      isCancelled: () => sessionMgr.cancelRequested,
      beforeContinuation: (attempt) =>
        persistRecoveryDecision(recCtx, {
          checkpointReason: "provider_limit",
          attempt,
          reason: "turn_ended_without_final",
          phase: "executing",
          action: "resume",
        }).then(() => {}),
    });
    const { stopReason, usage } = finished.result;
    watch?.close();
    if (finished.stillUnfinished) {
      await persistRecoveryDecision(recCtx, {
        checkpointReason: "max_turns",
        attempt: finished.continuations,
        reason: finished.timedOut ? "turn_budget_exhausted" : "finalization_failed",
        phase: "blocked",
        action: "escalate",
      });
      await tasksStore.endAttempt(continuationTaskId, ledger.seq, "max_turns").catch(() => {});
      send({ type: "error", message: "The engine stopped before it finished the answer. Progress has been preserved. Send another message and it will continue from here." });
    } else {
      await tasksStore.complete(continuationTaskId, ledger.seq).catch(() => {});
      ledger.append("task.finished", {
        taskId: "desktop",
        status: "ok",
        stopReason,
        wallMs: 0,
      });
    }

    send({ type: "turn-end", stopReason, usage });
    compaction.recordTurnCompleted(session.sessionId);

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
    await finishHandoff?.().catch((error: unknown) => send({ type: "error", message: `Cannot hand this to a team: ${errorMessage(error)}` }));
    warnUnclosed();
    const git = await readGitStatus(projectDir);
    send({ type: "git-status", git });
  } catch (err: unknown) {
    watch?.close();
    await finishHandoff?.().catch((error: unknown) => send({ type: "error", message: `Cannot hand this to a team: ${errorMessage(error)}` }));
    warnUnclosed();
    if (sessionMgr.handleAuthError(err, sessionMgr.currentEngineId)) return;
    const errMsg = err instanceof Error ? err.message : String(err);
    ledger.append("error", {
      taskId: "desktop",
      where: err instanceof EngineStalledError ? "engine.stalled" : "prompt",
      message: errMsg,
    });
    send({ type: "turn-end", stopReason: "stalled" });
    send({ type: "error", message: errMsg });
  } finally {
    unfinished.close();
    stopHandoffListen?.();
    if (canHandOff) teamEstimates.allowHandoff(false);
  }
}
