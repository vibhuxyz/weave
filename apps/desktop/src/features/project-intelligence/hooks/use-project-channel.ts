import { useCallback, type RefObject } from "react";
import type { ServerMessage } from "../../../../server/index.ts";
import { useProjectStore } from "../store";
import type { ProjectMessage } from "../types";

const PROJECT_MESSAGE_TYPES: ReadonlySet<string> = new Set(["project-overview", "project-overview-failed", "project-query-result", "project-query-failed"]);

function isProjectMessage(message: ServerMessage): message is ProjectMessage {
  return PROJECT_MESSAGE_TYPES.has(message.type);
}

export function useProjectChannel(socketRef: RefObject<WebSocket | null>) {
  const send = useCallback((payload: object): boolean => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }, [socketRef]);

  const handleMessage = useCallback((message: ServerMessage): boolean => {
    if (!isProjectMessage(message)) return false;
    useProjectStore.getState().receive(message);
    return true;
  }, []);

  const readOverview = useCallback(() => {
    if (send({ type: "read-project-overview" })) useProjectStore.getState().startOverview();
  }, [send]);

  const queryProject = useCallback((text: string) => {
    const queryId = crypto.randomUUID();
    if (send({ type: "query-project", queryId, text })) useProjectStore.getState().startQuery(queryId, text);
  }, [send]);

  const reset = useCallback(() => useProjectStore.getState().reset(), []);

  return { handleMessage, readOverview, queryProject, reset };
}
