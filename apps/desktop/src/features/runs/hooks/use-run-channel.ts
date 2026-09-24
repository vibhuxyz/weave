import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { ServerMessage } from "../../../../server/index.ts";
import { useRunStore } from "../store";
import type { RunMessage } from "../types";

function isRunMessage(message: ServerMessage): message is RunMessage {
  return message.type === "run-started" || message.type === "run-update" || message.type === "run-finished";
}

export function useRunChannel(socketRef: RefObject<WebSocket | null>) {
  const pendingRef = useRef<RunMessage[]>([]);
  const frameRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    const batch = pendingRef.current;
    pendingRef.current = [];
    useRunStore.getState().applyMessages(batch);
  }, []);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const handleMessage = useCallback(
    (message: ServerMessage): boolean => {
      if (!isRunMessage(message)) return false;
      pendingRef.current.push(message);
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(flush);
      return true;
    },
    [flush],
  );

  const sendMessage = useCallback(
    (payload: Readonly<Record<string, unknown>>) => {
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify(payload));
    },
    [socketRef],
  );

  const startRun = useCallback((request: string) => sendMessage({ type: "start-run", request }), [sendMessage]);
  const cancelRun = useCallback(() => sendMessage({ type: "cancel-run" }), [sendMessage]);

  return { handleMessage, startRun, cancelRun };
}
