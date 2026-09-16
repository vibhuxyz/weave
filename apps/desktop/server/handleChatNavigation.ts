import { getEngine } from "@weave/agent";
import { readGitStatus } from "@weave/core";
import type { DesktopSessionManager } from "./sessionManager.ts";
import type { ServerMessage } from "./server.types.ts";

export async function handleNewChat(options: {
  readonly instructions?: string;
  readonly sessionMgr: DesktopSessionManager;
  readonly projectDir: string;
  readonly send: (msg: ServerMessage) => void;
  readonly sendChats: () => Promise<void>;
}): Promise<void> {
  const { instructions, sessionMgr, projectDir, send, sendChats } = options;
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

export async function handleOpenChat(options: {
  readonly sessionId: string;
  readonly sessionMgr: DesktopSessionManager;
  readonly projectDir: string;
  readonly store: any;
  readonly send: (msg: ServerMessage) => void;
  readonly sendChats: () => Promise<void>;
}): Promise<void> {
  const { sessionId: target, sessionMgr, projectDir, store, send, sendChats } = options;
  if (!sessionMgr.supervisor) return;

  try {
    send({ type: "reset" });
    const ok = await sessionMgr.supervisor.current.resumeSession(target);
    if (!ok) {
      send({ type: "error", message: "Could not open that chat." });
      await sendChats();
      return;
    }
    sessionMgr.persisted = true;
    await store.set(projectDir, sessionMgr.supervisor.current.sessionId);
    send({
      type: "ready",
      sessionId: sessionMgr.supervisor.current.sessionId,
      cwd: projectDir,
      engineId: sessionMgr.currentEngineId,
      engineLabel: getEngine(sessionMgr.currentEngineId).label,
      configOptions: sessionMgr.supervisor.current.configOptions,
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
