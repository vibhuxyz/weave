import type { RecentMessage } from "@weave/protocol";
import { CODE_FENCE, MAX_RECENT_MESSAGE_CHARS, MAX_RECENT_MESSAGES } from "./constants.ts";

function summarize(text: string): string {
  const prose = text.replace(CODE_FENCE, " ").replace(/\s+/g, " ").trim();
  const characters = [...prose];
  return characters.length <= MAX_RECENT_MESSAGE_CHARS ? prose : `${characters.slice(0, MAX_RECENT_MESSAGE_CHARS - 1).join("")}…`;
}

export function withRecentMessage(recent: readonly RecentMessage[], message: RecentMessage): RecentMessage[] {
  const text = summarize(message.text);
  if (text === "") return [...recent];
  return [...recent, { ...message, text }].slice(-MAX_RECENT_MESSAGES);
}
