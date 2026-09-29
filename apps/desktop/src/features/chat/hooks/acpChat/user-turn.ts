import type { ChatTurn } from "./types";

export function userTurn(text: string, id: string, now: number): ChatTurn | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  return { id, role: "user", text: trimmed, createdAt: now, thought: "", tools: [] };
}
