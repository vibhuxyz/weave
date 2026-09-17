import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ChatTurn } from "@/features/chat/hooks";
import { buildServerRows } from "./useRunningServers/buildServerRows";
import { basename, detect, isSystemProcess } from "./useRunningServers/detect";
import { stopContainer, stopPortProcess } from "./useRunningServers/stopActions";
import type { DockerService, PortInfo, RunningServer } from "./useRunningServers/types";

export type { RunningServer } from "./useRunningServers/types";

const POLL_MS = 4000;

/**
 * Tracks the services a session left running, and lets the user stop them.
 *
 * Two sources, because the two kinds of service fail differently:
 *
 * - **Dev servers** are scraped from the tool log. The agent runs them inside
 *   its own process tree so we have no PID, but the output almost always
 *   carries a port, and killing whatever listens there is what the user wants.
 * - **Containers** come from `docker ps`, never from the transcript. A
 *   transcript is per-session; a container outlives the session, the chat, and
 *   the app itself, so a transcript-derived list would drop the row while the
 *   container kept running — leaving it orphaned with no way to stop it.
 */
export function useRunningServers(
  turns: ChatTurn[],
  projectDir?: string,
  knownDirs: string[] = [],
) {
  const fallbackProject = projectDir ? basename(projectDir) : undefined;
  const detected = useMemo(
    () => detect(turns, fallbackProject),
    [turns, fallbackProject],
  );
  const portKey = detected.map((s) => s.port).join(",");
  const [alive, setAlive] = useState<Record<number, boolean>>({});
  const [stopping, setStopping] = useState<Record<string, boolean>>({});
  const [containers, setContainers] = useState<DockerService[]>([]);

  // Every directory a container may legitimately belong to. Anything running
  // outside them is somebody else's and is not shown.
  const roots = useMemo(() => {
    const all = [...knownDirs, projectDir].filter(
      (d): d is string => typeof d === "string" && d.length > 0,
    );
    return [...new Set(all)];
  }, [knownDirs.join("\n"), projectDir]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const entries = await Promise.all(
        detected.map(async (s) => {
          try {
            const info = await invoke<PortInfo | null>("port_info", {
              port: s.port,
            });
            return [
              s.port,
              info != null && !isSystemProcess(info.command),
            ] as const;
          } catch {
            return [s.port, false] as const;
          }
        }),
      );

      let running: DockerService[] = [];
      try {
        running = await invoke<DockerService[]>("docker_services");
      } catch {
        // Docker absent or daemon down — no containers to report, not an error.
      }

      if (cancelled) return;
      setAlive(Object.fromEntries(entries));
      setContainers(running);
    };
    void check();
    const id = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [portKey]);

  const servers: RunningServer[] = useMemo(
    () => buildServerRows({ detected, containers, roots, alive, stopping }),
    [detected, containers, roots, alive, stopping],
  );

  const stop = useCallback(async (server: RunningServer) => {
    const { key, port, container } = server;

    if (container) {
      await stopContainer(container, key, setStopping, setContainers);
      return;
    }

    await stopPortProcess(port, key, setAlive, setStopping);
  }, []);

  return { servers, stop };
}
