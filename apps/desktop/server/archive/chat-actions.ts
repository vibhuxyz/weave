import { isProjectDir } from "../chat/index.ts";
import type { StorageResult } from "../storage/index.ts";
import { SESSION_ID_PATTERN } from "./constants.ts";
import type { ChatAction, ChatActionOptions, ChatActionRequest } from "./types.ts";

const ACTION_VERBS: Readonly<Record<ChatAction, string>> = { archive: "archive", restore: "restore", delete: "delete" };

function apply(action: ChatAction, projectDir: string, sessionId: string, options: ChatActionOptions): Promise<StorageResult<null>> {
  switch (action) {
    case "archive":
      return options.directory.setChatArchived(projectDir, sessionId, options.now());
    case "restore":
      return options.directory.setChatArchived(projectDir, sessionId, null);
    case "delete":
      return options.directory.deleteChat(projectDir, sessionId);
    default: {
      const unreachable: never = action;
      throw new Error(`Unknown chat action ${String(unreachable)}`);
    }
  }
}

function doneMessageType(action: ChatAction): "chat-archived" | "chat-restored" | "chat-deleted" {
  if (action === "archive") return "chat-archived";
  if (action === "restore") return "chat-restored";
  return "chat-deleted";
}

export async function handleChatAction(action: ChatAction, request: ChatActionRequest, options: ChatActionOptions): Promise<void> {
  const { sessionId, projectDir } = request;
  const verb = ACTION_VERBS[action];
  if (typeof sessionId !== "string" || !SESSION_ID_PATTERN.test(sessionId) || !isProjectDir(projectDir)) {
    options.send({ type: "error", message: `Cannot ${verb} chat: the request needs a valid chat id and project folder.` });
    return;
  }
  const result = await apply(action, projectDir, sessionId, options);
  if (!result.ok) {
    options.send({ type: "error", message: `Cannot ${verb} chat: ${result.reason}` });
    return;
  }
  options.send({ type: doneMessageType(action), sessionId, projectDir });
  if (action !== "restore" && sessionId === options.currentSessionId()) {
    await options.startNewChat();
    return;
  }
  await options.sendChats();
}
