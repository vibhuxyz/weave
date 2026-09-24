import { useCallback, type RefObject } from "react";
import type { ServerMessage } from "../../../../server/index.ts";
import { useFileStore } from "../store";
import type { FileMessage } from "../types";

function isFileMessage(message: ServerMessage): message is FileMessage {
  return message.type === "file-content" || message.type === "file-error";
}

export function useFileChannel(socketRef: RefObject<WebSocket | null>) {
  const handleMessage = useCallback((message: ServerMessage): boolean => {
    if (!isFileMessage(message)) return false;
    useFileStore.getState().receive(message);
    return true;
  }, []);

  const openFile = useCallback(
    (path: string) => {
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) return;
      useFileStore.getState().open(path);
      socket.send(JSON.stringify({ type: "read-file", path }));
    },
    [socketRef],
  );

  return { handleMessage, openFile };
}
