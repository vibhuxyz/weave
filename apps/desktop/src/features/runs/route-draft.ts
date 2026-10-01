import { OTHER_SLASH_COMMAND } from "./constants";
import { parseChatCommand, parseRunCommand } from "./run-command";
import type { DraftContext, DraftRoute } from "./types";

function needsChat(context: DraftContext): boolean {
  return context.imageCount > 0 || context.mentionCount > 0 || context.isRunActive;
}

export function routeDraft(draft: string, context: DraftContext): DraftRoute {
  const runRequest = parseRunCommand(draft);
  if (runRequest !== null) return { kind: "team", request: runRequest };
  const chatRequest = parseChatCommand(draft);
  if (chatRequest !== null) return { kind: "chat", text: chatRequest, canHandOff: false };
  const canHandOff = !needsChat(context) && !OTHER_SLASH_COMMAND.test(draft.trim());
  return { kind: "chat", text: draft, canHandOff };
}
