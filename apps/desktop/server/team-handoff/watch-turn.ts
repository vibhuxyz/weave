import type { Ledger } from "@weave/core";
import type { WeaveEvent } from "@weave/protocol";
import { MAX_WATCHED_TEXT_CHARS } from "./constants.ts";
import type { TurnWatch } from "./types.ts";

interface UpdateFields {
  readonly sessionUpdate?: unknown;
  readonly content?: { readonly type?: unknown; readonly text?: unknown };
}

function messageText(update: UpdateFields): string {
  const content = update.content;
  return update.sessionUpdate === "agent_message_chunk" && content?.type === "text" && typeof content.text === "string" ? content.text : "";
}

export function watchTurn(ledger: Ledger, taskId: string): TurnWatch {
  const buffer = { text: "" };
  const unsubscribe = ledger.subscribe((event: WeaveEvent) => {
    if (event.type !== "agent.message" || event.taskId !== taskId) return;
    buffer.text = (buffer.text + messageText(event.update as UpdateFields)).slice(-MAX_WATCHED_TEXT_CHARS);
  });
  return { read: () => buffer.text, close: unsubscribe };
}
