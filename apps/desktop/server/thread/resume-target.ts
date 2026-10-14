import type { ProjectChats } from "../chat/index.ts";

export function resumeTarget(chats: ProjectChats, threadId: string, engineId: string): string | null {
  const seat = chats.seat(threadId, engineId);
  if (seat !== null) return seat.engineSessionId;
  const isLegacyChat = chats.seatCount(threadId) === 0;
  return isLegacyChat && chats.engineOf(threadId) === engineId ? threadId : null;
}

export function isMultiEngineThread(chats: ProjectChats, threadId: string): boolean {
  return chats.seatCount(threadId) > 1;
}
