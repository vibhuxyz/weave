import { useCallback, type RefObject } from "react";
import type { ServerMessage } from "../../../../server/index.ts";
import { useSkillStore } from "../store";

export function useSkillChannel(socketRef: RefObject<WebSocket | null>) {
  const handleMessage = useCallback((message: ServerMessage): boolean => {
    if (message.type !== "skills" && message.type !== "skills-failed") return false;
    useSkillStore.getState().receive(message);
    return true;
  }, []);

  const expectListing = useCallback(() => useSkillStore.getState().startLoading(), []);

  const refreshSkills = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    useSkillStore.getState().startLoading();
    socket.send(JSON.stringify({ type: "list-skills" }));
  }, [socketRef]);

  const reset = useCallback(() => useSkillStore.getState().reset(), []);

  return { handleMessage, expectListing, refreshSkills, reset };
}
