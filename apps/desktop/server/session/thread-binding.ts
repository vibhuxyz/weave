import { getEngine, type EngineSupervisor } from "@weave/agent";
import { archiveHasRunTurn, type HistoryArchive } from "../history/index.ts";
import { isMultiEngineThread, prepareHandoff, resumeTarget } from "../thread/index.ts";
import type { SessionContext } from "./types.ts";

export interface HandOffOptions {
  readonly ctx: SessionContext;
  readonly threadId: string;
  readonly fromEngineId: string;
  readonly engineId: string;
  readonly engineSessionId: string;
}

export async function switchEngineSession(
  supervisor: EngineSupervisor,
  ctx: SessionContext,
  target: { readonly engineId: string; readonly resumeId: string | null },
): Promise<void> {
  if (target.resumeId !== null) ctx.replayGate.mute(target.resumeId);
  try {
    await supervisor.switchTo(target.engineId, target.resumeId);
  } finally {
    ctx.replayGate.unmute();
  }
}

export async function handOffThread({ ctx, threadId, fromEngineId, engineId, engineSessionId }: HandOffOptions): Promise<string | null> {
  const prepared = await prepareHandoff({ chats: ctx.chats, threadId, engineId, engineSessionId, projectDir: ctx.projectDir });
  const label = getEngine(engineId).label;
  if (!prepared.ok) {
    ctx.send({ type: "error", message: `Cannot hand this chat to ${label}: ${prepared.reason}` });
    return null;
  }
  if (fromEngineId !== engineId) {
    ctx.send({
      type: "engine-handoff",
      threadId,
      fromEngineId,
      toEngineId: engineId,
      toEngineLabel: label,
      isResumed: prepared.value.isResumed,
      turnsHandedOff: prepared.value.turnsHandedOff,
      bytes: prepared.value.bytes,
    });
  }
  return prepared.value.preamble;
}

function loadArchive(ctx: SessionContext, threadId: string): HistoryArchive | null {
  const loaded = ctx.history.load(threadId);
  if (!loaded.ok) ctx.send({ type: "error", message: loaded.reason });
  return loaded.ok ? loaded.value : null;
}

function sendArchive(ctx: SessionContext, threadId: string, archive: HistoryArchive): void {
  ctx.send({ type: "history-archive", sessionId: threadId, turns: archive.turns, droppedTurnCount: archive.droppedTurnCount });
}

export function prepareThreadReplay(ctx: SessionContext, threadId: string, engineSessionId: string): void {
  const archive = loadArchive(ctx, threadId);
  if (archive !== null && (isMultiEngineThread(ctx.chats, threadId) || archiveHasRunTurn(archive))) {
    sendArchive(ctx, threadId, archive);
    ctx.replayGate.mute(engineSessionId);
    return;
  }
  ctx.replayGate.arm(engineSessionId, archive);
}

export async function openThreadSession(
  supervisor: EngineSupervisor,
  ctx: SessionContext,
  target: { readonly threadId: string; readonly engineId: string },
): Promise<{ readonly isOpen: boolean; readonly preamble: string | null }> {
  const { threadId, engineId } = target;
  const resumeId = resumeTarget(ctx.chats, threadId, engineId);
  if (resumeId === null) {
    const archive = loadArchive(ctx, threadId);
    if (archive !== null) sendArchive(ctx, threadId, archive);
    await supervisor.current.newSession();
  } else {
    prepareThreadReplay(ctx, threadId, resumeId);
    const isResumed = await supervisor.current.resumeSession(resumeId).finally(() => {
      ctx.replayGate.disarm();
      ctx.replayGate.unmute();
    });
    if (!isResumed) return { isOpen: false, preamble: null };
  }
  const engineSessionId = supervisor.current.sessionId;
  const preamble = await handOffThread({ ctx, threadId, fromEngineId: engineId, engineId, engineSessionId });
  return { isOpen: true, preamble };
}
