import { useEffect, useRef, type RefObject } from "react";
import { buildHistoryArchive } from "../acpChat/history-archive";
import type { ChatTurn } from "../acpChat/types";
import { hasEngineHandoff, hasRunTurn } from "./handoff-turn";

export interface ThreadArchiveOptions {
  readonly socketRef: RefObject<WebSocket | null>;
  readonly turns: readonly ChatTurn[];
  readonly isBusy: boolean;
  readonly threadId: string | null;
}

export function useThreadArchive({ socketRef, turns, isBusy, threadId }: ThreadArchiveOptions): void {
  const savedTurnIdRef = useRef<string | null>(null);
  const lastTurnId = turns.at(-1)?.id ?? null;
  const isArchivedChat = hasEngineHandoff(turns) || hasRunTurn(turns);

  useEffect(() => {
    const socket = socketRef.current;
    if (isBusy || !isArchivedChat || !lastTurnId || !threadId || socket?.readyState !== WebSocket.OPEN) return;
    if (savedTurnIdRef.current === lastTurnId) return;
    savedTurnIdRef.current = lastTurnId;
    const archive = buildHistoryArchive(turns, lastTurnId);
    if (archive) socket.send(JSON.stringify({ type: "save-history", sessionId: threadId, ...archive }));
  }, [socketRef, turns, isBusy, isArchivedChat, lastTurnId, threadId]);
}
