import { useCallback, useEffect, type RefObject } from "react";
import type { ServerMessage } from "../../../../server/index.ts";
import { useWorkforceStore } from "../store";
import type { WorkforceMessage } from "../types";

const WORKFORCE_TYPES: ReadonlySet<string> = new Set(["employees", "employee-saved", "employee-error", "skills", "project-model", "project-model-error"]);

function isWorkforceMessage(message: ServerMessage): message is WorkforceMessage {
  return WORKFORCE_TYPES.has(message.type);
}

export function useWorkforceChannel(socketRef: RefObject<WebSocket | null>) {
  useEffect(() => {
    useWorkforceStore.getState().setTransport((payload) => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    });
    return () => useWorkforceStore.getState().setTransport(null);
  }, [socketRef]);

  const handleMessage = useCallback((message: ServerMessage): boolean => {
    if (!isWorkforceMessage(message)) return false;
    useWorkforceStore.getState().receive(message);
    return true;
  }, []);

  return { handleMessage };
}
