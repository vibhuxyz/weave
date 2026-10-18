import { useCallback, type RefObject } from "react";
import type { ServerMessage } from "../../../../server/index.ts";
import { COMMIT_LIST_LIMIT } from "../constants";
import { useDiffViewerStore } from "../store";
import type { DiffMessage, DiffRange } from "../types";

const DIFF_MESSAGE_TYPES = new Set([
  "diff-refs-result",
  "diff-commits-result",
  "diff-files-result",
  "diff-patch-result",
  "diff-context-result",
  "diff-failed",
]);

function isDiffMessage(message: ServerMessage): message is DiffMessage {
  return DIFF_MESSAGE_TYPES.has(message.type);
}

export function useDiffChannel(socketRef: RefObject<WebSocket | null>) {
  const send = useCallback(
    (payload: object): boolean => {
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(payload));
      return true;
    },
    [socketRef],
  );

  const handleMessage = useCallback((message: ServerMessage): boolean => {
    if (!isDiffMessage(message)) return false;
    return useDiffViewerStore.getState().receive(message);
  }, []);

  const requestRefs = useCallback(() => {
    send({ type: "diff-refs", requestId: crypto.randomUUID() });
  }, [send]);

  const requestCommits = useCallback(
    (base: string | null) => {
      send({ type: "diff-commits", requestId: crypto.randomUUID(), limit: COMMIT_LIST_LIMIT, base });
    },
    [send],
  );

  const requestStats = useCallback(
    (range: DiffRange) => {
      const requestId = crypto.randomUUID();
      useDiffViewerStore.getState().startStats(requestId);
      if (!send({ type: "diff-files", requestId, range })) {
        useDiffViewerStore.getState().receive({
          type: "diff-failed",
          requestId,
          message: "Not connected to the project server.",
        });
      }
    },
    [send],
  );

  const requestPatch = useCallback(
    (range: DiffRange, paths: readonly string[]) => {
      const requestId = crypto.randomUUID();
      useDiffViewerStore.getState().startPatch(requestId, paths);
      send({ type: "diff-patch", requestId, range, paths });
    },
    [send],
  );

  const requestContext = useCallback(
    (path: string, rev: string | null, from: number, to: number) => {
      send({ type: "diff-context", requestId: crypto.randomUUID(), path, rev, from, to });
    },
    [send],
  );

  return { handleMessage, requestRefs, requestCommits, requestStats, requestPatch, requestContext };
}

export type DiffChannel = ReturnType<typeof useDiffChannel>;

const ignore = () => {};

export const INERT_DIFF_CHANNEL: DiffChannel = {
  handleMessage: () => false,
  requestRefs: ignore,
  requestCommits: ignore,
  requestStats: ignore,
  requestPatch: ignore,
  requestContext: ignore,
};
