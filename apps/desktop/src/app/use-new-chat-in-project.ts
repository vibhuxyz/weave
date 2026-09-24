import { useCallback, useEffect, useRef } from "react";
import type { ConnectionState } from "@/features/chat/hooks";

export interface NewChatRequest {
  readonly engineId?: string;
  readonly afterStart?: () => void;
}

interface PendingProjectAction {
  readonly dir: string;
  readonly run: () => void;
  hasReconnected: boolean;
}

interface ProjectActionOptions {
  readonly activeDir: string | undefined;
  readonly connection: ConnectionState;
  readonly openProject: (dir: string, engineId?: string) => void;
}

interface NewChatInProjectOptions extends ProjectActionOptions {
  readonly startNewChat: () => void;
}

export function useRunInProject({
  activeDir,
  connection,
  openProject,
}: ProjectActionOptions): (dir: string, run: () => void, engineId?: string) => void {
  const pending = useRef<PendingProjectAction | null>(null);

  useEffect(() => {
    const request = pending.current;
    if (!request) return;
    if (connection !== "ready") {
      request.hasReconnected = true;
      return;
    }
    if (request.hasReconnected && activeDir === request.dir) {
      pending.current = null;
      request.run();
    }
  }, [connection, activeDir]);

  return useCallback(
    (dir: string, run: () => void, engineId?: string) => {
      if (dir === activeDir && engineId === undefined && connection === "ready") {
        pending.current = null;
        run();
        return;
      }
      const needsProjectStart = dir !== activeDir || engineId !== undefined;
      pending.current = { dir, run, hasReconnected: !needsProjectStart };
      if (needsProjectStart) openProject(dir, engineId);
    },
    [activeDir, connection, openProject],
  );
}

export function useNewChatInProject({
  startNewChat,
  ...options
}: NewChatInProjectOptions): (dir: string, request?: NewChatRequest) => void {
  const runInProject = useRunInProject(options);
  return useCallback(
    (dir: string, request: NewChatRequest = {}) =>
      runInProject(
        dir,
        () => {
          startNewChat();
          request.afterStart?.();
        },
        request.engineId,
      ),
    [runInProject, startNewChat],
  );
}
