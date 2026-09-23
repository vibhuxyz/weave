import { useCallback, useEffect, useRef } from "react";
import type { ConnectionState } from "@/features/chat/hooks";

interface PendingProjectChat {
  readonly dir: string;
  hasReconnected: boolean;
}

interface NewChatInProjectOptions {
  readonly activeDir: string | undefined;
  readonly connection: ConnectionState;
  readonly startNewChat: () => void;
  readonly openProject: (dir: string) => void;
}

export function useNewChatInProject({
  activeDir,
  connection,
  startNewChat,
  openProject,
}: NewChatInProjectOptions): (dir: string) => void {
  const pending = useRef<PendingProjectChat | null>(null);

  useEffect(() => {
    const request = pending.current;
    if (!request) return;
    if (connection !== "ready") {
      request.hasReconnected = true;
      return;
    }
    if (request.hasReconnected && activeDir === request.dir) {
      pending.current = null;
      startNewChat();
    }
  }, [connection, activeDir, startNewChat]);

  return useCallback(
    (dir: string) => {
      if (dir === activeDir) {
        startNewChat();
        return;
      }
      pending.current = { dir, hasReconnected: false };
      openProject(dir);
    },
    [activeDir, startNewChat, openProject],
  );
}
