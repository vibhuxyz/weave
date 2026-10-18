import { titleFromPrompt } from "@weave/core";
import type { ProjectChats } from "../chat/index.ts";
import type { DesktopSessionManager } from "../session/index.ts";
import { errorMessage, type ServerMessage } from "../shared/index.ts";
import { createRunTurnLog } from "../thread/index.ts";

export interface RunSendOptions {
  readonly sessionMgr: DesktopSessionManager;
  readonly chats: ProjectChats;
  readonly send: (message: ServerMessage) => void;
  readonly sendChats: () => Promise<void>;
}

function bindThread(options: RunSendOptions, request: string): string | null {
  const { sessionMgr, chats, send } = options;
  const threadId = (sessionMgr.threadId ??= sessionMgr.supervisor?.current.sessionId ?? null);
  if (threadId === null) return null;
  if (sessionMgr.persisted) return threadId;
  const recorded = chats.record(threadId, { title: titleFromPrompt(request), engineId: sessionMgr.currentEngineId, personaIds: [] });
  if (!recorded.ok) {
    send({ type: "error", message: `Cannot save this chat: ${recorded.reason}` });
    return null;
  }
  sessionMgr.persisted = true;
  chats.rememberLastSession(threadId);
  options.sendChats().catch((error: unknown) => send({ type: "error", message: `Cannot refresh the chat list: ${errorMessage(error)}` }));
  return threadId;
}

export function sendWithRunTurnLog(options: RunSendOptions, request: string): (message: ServerMessage) => void {
  const { sessionMgr, chats, send } = options;
  const log = createRunTurnLog({
    request,
    engineId: sessionMgr.currentEngineId,
    chats,
    bindThread: (text) => bindThread(options, text),
    announce: (brief) => {
      sessionMgr.pendingPreamble = [sessionMgr.pendingPreamble, brief].filter((part) => part !== null).join("\n\n");
    },
    onError: (message) => send({ type: "error", message }),
  });
  return (message) => {
    log.observe(message);
    send(message);
  };
}
