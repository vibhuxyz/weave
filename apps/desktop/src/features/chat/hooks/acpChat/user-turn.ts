import type { ChatImageAttachment, ChatTurn } from "./types";

export function userTurn(text: string, id: string, now: number, images?: readonly ChatImageAttachment[]): ChatTurn | null {
  const trimmed = text.trim();
  const attached = (images ?? []).filter((image) => image.previewUrl !== "" || image.prompt.trim() !== "");
  if (trimmed === "" && attached.length === 0) return null;
  return {
    id,
    role: "user",
    text: trimmed,
    createdAt: now,
    thought: "",
    tools: [],
    ...(attached.length > 0 ? { images: [...attached] } : {}),
  };
}
