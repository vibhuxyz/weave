import { getEngine } from "@weave/agent";
import { readGitStatus } from "@weave/core";
import type { ProjectChats } from "../chat/index.ts";
import type { DesktopSessionManager } from "../session/index.ts";
import type { ServerMessage } from "../shared/index.ts";

export interface NewChatOptions {
  readonly instructions?: string;
  readonly sessionMgr: DesktopSessionManager;
  readonly projectDir: string;
  readonly send: (msg: ServerMessage) => void;
  readonly sendChats: () => Promise<void>;
}

export async function handleNewChat({
  instructions,
  sessionMgr,
  projectDir,
  send,
  sendChats,
}: NewChatOptions): Promise<void> {
  if (!sessionMgr.supervisor) return;

  try {
    const sessionId = await sessionMgr.supervisor.current.newSession();
    sessionMgr.persisted = false;
    sessionMgr.pendingPreamble = instructions?.trim() || null;
    send({ type: "reset" });
    send({
      type: "ready",
      sessionId,
      cwd: projectDir,
      engineId: sessionMgr.currentEngineId,
      engineLabel: getEngine(sessionMgr.currentEngineId).label,
      configOptions: sessionMgr.supervisor.current.configOptions,
      modes: sessionMgr.supervisor.current.modes,
      resumed: false,
    });
    await sendChats();
  } catch (err: unknown) {
    send({
      type: "error",
      message: `Could not start a new chat: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

export interface OpenChatOptions {
  readonly sessionId: string;
  readonly sessionMgr: DesktopSessionManager;
  readonly projectDir: string;
  readonly chats: ProjectChats;
  readonly send: (msg: ServerMessage) => void;
  readonly sendChats: () => Promise<void>;
}

export async function handleOpenChat({
  sessionId: target,
  sessionMgr,
  projectDir,
  chats,
  send,
  sendChats,
}: OpenChatOptions): Promise<void> {
  if (!sessionMgr.supervisor) return;
  const isOpenSession = target === sessionMgr.supervisor.current.sessionId;
  if (!isOpenSession && !chats.has(target)) {
    send({ type: "error", message: `Cannot open chat ${target}: it does not belong to this project.` });
    return;
  }

  try {
    send({ type: "reset" });
    sessionMgr.prepareReplay(target);
    const ok = await sessionMgr.supervisor.current
      .resumeSession(target)
      .finally(() => sessionMgr.finishReplay());
    if (!ok) {
      send({ type: "error", message: "Could not open that chat." });
      await sendChats();
      return;
    }
    sessionMgr.persisted = true;
    chats.rememberLastSession(sessionMgr.supervisor.current.sessionId);
    send({
      type: "ready",
      sessionId: sessionMgr.supervisor.current.sessionId,
      cwd: projectDir,
      engineId: sessionMgr.currentEngineId,
      engineLabel: getEngine(sessionMgr.currentEngineId).label,
      configOptions: sessionMgr.supervisor.current.configOptions,
      modes: sessionMgr.supervisor.current.modes,
      resumed: true,
    });
    await sendChats();
    send({ type: "git-status", git: await readGitStatus(projectDir) });
  } catch (err: unknown) {
    send({
      type: "error",
      message: `Could not open that chat: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
