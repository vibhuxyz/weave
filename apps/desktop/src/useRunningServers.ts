import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import type { ChatTurn } from "./useAcpChat";

export interface RunningServer {
  port: number;
  /** Friendly label (the tool title, e.g. "Start Express server"). */
  label: string;
  /** The actual command line, when we could read it. */
  command: string;
  /** Basename of the working directory the command ran in. */
  project?: string;
  alive: boolean;
  /** True between the confirm and the port going quiet. */
  stopping: boolean;
}

interface PortInfo {
  pid: number;
  command: string;
}

const SERVER_CMD =
  /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve|preview)|next\s+(?:dev|start)|vite\b|nodemon\b|remix\s+dev|astro\s+dev|ng\s+serve|rails\s+s(?:erver)?\b|flask\s+run|uvicorn\b|gunicorn\b|php\s+-S|http-server\b|\bserve\b|node\s+\S*(?:server|app|index|main)\S*\.[mc]?[jt]s|start\b.*\bserver\b|run\b.*\b(?:dev|server)\b)/i;

/** "the app is running on http://localhost:3000" style text. */
const RUNNING_TEXT =
  /\b(?:server (?:has been |is )?(?:started|running|up)|app is (?:opened|running|live)|running (?:at|on)|listening (?:at|on)|dev server|now available)\b/i;

/** This app's own ports — never offer to kill these. */
const APP_PORTS = new Set([8137, 5180, 1420, 5173]);

function extractPorts(text: string): number[] {
  const found = new Set<number>();
  const patterns = [
    /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/gi,
    /\bport[=:\s]+(\d{2,5})/gi,
    /--port[=\s]+(\d{2,5})/gi,
    /\slisten(?:ing)?\b[^\n]*?:(\d{2,5})/gi,
    /\bhttps?:\/\/[^\s/]+:(\d{2,5})/gi,
  ];
  for (const p of patterns) {
    for (const m of text.matchAll(p)) {
      const n = Number(m[1]);
      if (n >= 1024 && n <= 65535 && !APP_PORTS.has(n)) found.add(n);
    }
  }
  return [...found];
}

type DetectedServer = Omit<RunningServer, "alive" | "stopping">;

/** Servers the agent has started this session, keyed by port. */
function detect(turns: ChatTurn[], fallbackProject?: string): DetectedServer[] {
  const byPort = new Map<number, DetectedServer>();

  for (const turn of turns) {
    if (turn.role !== "assistant") continue;

    const serverTool = turn.tools.find((t) => {
      const cmd =
        /"CommandLine":\s*"([^"]+)"/.exec(t.output ?? "")?.[1] ?? t.title;
      return SERVER_CMD.test(cmd) || SERVER_CMD.test(t.title);
    });

    const haystack = [
      turn.text,
      ...turn.tools.map((t) => `${t.title}\n${t.output ?? ""}`),
    ].join("\n");
    if (!serverTool && !RUNNING_TEXT.test(turn.text)) continue;

    const cwd =
      /"Cwd":\s*"([^"]+)"/.exec(serverTool?.output ?? "")?.[1] ??
      /"Cwd":\s*"([^"]+)"/.exec(haystack)?.[1];
    const project = cwd
      ? cwd.replace(/\/+$/, "").split("/").pop() || undefined
      : fallbackProject;

    for (const port of extractPorts(haystack)) {
      const cmd =
        /"CommandLine":\s*"([^"]+)"/.exec(serverTool?.output ?? "")?.[1] ??
        serverTool?.title ??
        "server";
      byPort.set(port, {
        port,
        label: serverTool?.title || `Server on :${port}`,
        command: cmd,
        project,
      });
    }
  }

  return [...byPort.values()];
}

/**
 * Tracks dev servers the agent has spawned (from the tool log) and lets the
 * user kill them by port. The agent runs them inside its own process tree so
 * we have no PID — but the output almost always carries a port, and killing
 * whatever listens there is what the user wants.
 */
export function useRunningServers(turns: ChatTurn[], projectDir?: string) {
  const fallbackProject = projectDir
    ? projectDir.replace(/\/+$/, "").split("/").pop() || undefined
    : undefined;
  const detected = useMemo(
    () => detect(turns, fallbackProject),
    [turns, fallbackProject],
  );
  const portKey = detected.map((s) => s.port).join(",");
  const [alive, setAlive] = useState<Record<number, boolean>>({});
  const [stopping, setStopping] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (detected.length === 0) return;
    let cancelled = false;
    const check = async () => {
      const entries = await Promise.all(
        detected.map(async (s) => {
          try {
            const info = await invoke<PortInfo | null>("port_info", {
              port: s.port,
            });
            return [s.port, info != null] as const;
          } catch {
            return [s.port, false] as const;
          }
        }),
      );
      if (!cancelled) setAlive(Object.fromEntries(entries));
    };
    void check();
    const id = setInterval(check, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portKey]);

  const servers: RunningServer[] = detected
    .map((s) => ({
      ...s,
      alive: alive[s.port] ?? true,
      stopping: stopping[s.port] ?? false,
    }))
    // Drop a port once it's confirmed dead — unless we're mid-stop, so the
    // "Stopping…" row stays visible until the kill actually lands.
    .filter((s) => alive[s.port] !== false || stopping[s.port]);

  const stop = useCallback(async (port: number) => {
    let info: PortInfo | null = null;
    try {
      info = await invoke<PortInfo | null>("port_info", { port });
    } catch {
      /* fall through */
    }
    if (!info) {
      setAlive((a) => ({ ...a, [port]: false }));
      return;
    }
    const confirmed = await ask(
      `Kill "${info.command}"\n(pid ${info.pid}) listening on port ${port}?`,
      { title: "Stop server", kind: "warning" },
    );
    if (!confirmed) return;

    setStopping((s) => ({ ...s, [port]: true }));
    try {
      await invoke("kill_port", { port });
    } catch {
      /* the poll below decides whether it worked */
    }

    // Poll until the port goes quiet (or give up after ~8s).
    const deadline = Date.now() + 8000;
    const settle = async () => {
      let gone = false;
      try {
        gone = (await invoke<PortInfo | null>("port_info", { port })) == null;
      } catch {
        gone = true;
      }
      if (gone || Date.now() > deadline) {
        setAlive((a) => ({ ...a, [port]: false }));
        setStopping((s) => {
          const next = { ...s };
          delete next[port];
          return next;
        });
      } else {
        setTimeout(settle, 700);
      }
    };
    void settle();
  }, []);

  return { servers, stop };
}
