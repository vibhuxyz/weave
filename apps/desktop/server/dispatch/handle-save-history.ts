import { parseArchive } from "../history/index.ts";
import type { HistoryStore } from "../history/index.ts";
import type { ServerMessage } from "../shared/index.ts";

export interface SaveHistoryOptions {
  readonly raw: unknown;
  readonly history: HistoryStore;
  readonly send: (msg: ServerMessage) => void;
}

export async function handleSaveHistory({ raw, history, send }: SaveHistoryOptions): Promise<void> {
  const parsed = parseArchive(raw);
  if (!parsed.ok) {
    send({ type: "error", message: `Cannot save chat history: ${parsed.reason}` });
    return;
  }
  const saved = await history.save(parsed.value);
  if (!saved.ok) send({ type: "error", message: `Cannot save chat history: ${saved.reason}` });
}
