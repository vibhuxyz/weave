import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import type { ChatTurn } from "./useAcpChat";

export interface RunningServer {
  /** Stable identity: `port:3000` for a process, `container:<id>` for Docker. */
  key: string;
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
  /** Set when this row is a Docker container rather than a process. */
  container?: { id: string; name: string; composeProject?: string };
  /**
   * The current chat did not start this — it is left over from an earlier
   * session (or from before the app was launched) and is still running.
   */
  leftover: boolean;
}

interface PortInfo {
  pid: number;
  command: string;
}

/** Mirrors `DockerService` in src-tauri/src/lib.rs. */
interface DockerService {
  id: string;
  name: string;
  image: string;
  ports: number[];
  composeProject?: string;
  workingDir?: string;
}

/**
 * macOS squats on well-known ports for its own services — 5000 and 7000 are
 * AirPlay Receiver (Control Center) — so a dev server that failed to bind its
 * port (or hasn't started yet) can show *that* as the listener instead. It is
 * never the server the agent started, so it should never read as "running".
 */
function isSystemProcess(command: string): boolean {
  return command.startsWith("/System/") || command.startsWith("/usr/libexec/");
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

type DetectedServer = Pick<
  RunningServer,
  "port" | "label" | "command" | "project"
>;

const KNOWN_SERVICES: Record<number, string> = {
  27017: "MongoDB",
  27018: "MongoDB",
  6379: "Redis",
  5432: "PostgreSQL",
  3306: "MySQL",
  9200: "Elasticsearch",
  11211: "Memcached",
  15672: "RabbitMQ",
  5672: "RabbitMQ",
  9092: "Kafka",
};

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
      const known = KNOWN_SERVICES[port];
      const cmd =
        /"CommandLine":\s*"([^"]+)"/.exec(serverTool?.output ?? "")?.[1] ??
        serverTool?.title ??
        "server";
      byPort.set(port, {
        port,
        label: known || serverTool?.title || `Server on :${port}`,
        command: cmd,
        project,
      });
    }
  }

  return [...byPort.values()];
}

const basename = (dir: string) =>
  dir.replace(/\/+$/, "").split("/").pop() || undefined;

/** Is `dir` at or below `root`? Both are absolute paths from Docker/Tauri. */
function isUnder(dir: string, root: string): boolean {
  const a = dir.replace(/\/+$/, "");
  const b = root.replace(/\/+$/, "");
  return a === b || a.startsWith(`${b}/`);
}

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portKey]);

  const servers: RunningServer[] = useMemo(() => {
    const sessionPorts = new Set(detected.map((s) => s.port));

    const containerRows = containers
      .filter((c) => c.workingDir && roots.some((r) => isUnder(c.workingDir!, r)))
      // A container with nothing published is unreachable from the host, so
      // there is nothing for the user to have been using.
      .filter((c) => c.ports.length > 0)
      .map<RunningServer>((c) => {
        const port = c.ports[0];
        return {
          key: `container:${c.id}`,
          port,
          label: KNOWN_SERVICES[port] || c.image.split(":")[0] || c.name,
          command: c.image,
          project: c.composeProject || basename(c.workingDir!),
          alive: true,
          stopping: stopping[`container:${c.id}`] ?? false,
          container: {
            id: c.id,
            name: c.name,
            composeProject: c.composeProject,
          },
          leftover: !c.ports.some((p) => sessionPorts.has(p)),
        };
      });

    // A port a shown container publishes is *its* row, not a transcript row
    // too — otherwise Postgres appears twice, once scraped and once real.
    const shown = new Set(containerRows.map((r) => r.container!.id));
    const containerPorts = new Set(
      containers.filter((c) => shown.has(c.id)).flatMap((c) => c.ports),
    );

    const processRows = detected
      .filter((s) => !containerPorts.has(s.port))
      .map<RunningServer>((s) => ({
        ...s,
        key: `port:${s.port}`,
        alive: alive[s.port] ?? true,
        stopping: stopping[`port:${s.port}`] ?? false,
        leftover: false,
      }))
      // Drop a port once it's confirmed dead — unless we're mid-stop, so the
      // "Stopping…" row stays visible until the kill actually lands.
      .filter((s) => alive[s.port] !== false || s.stopping);

    return [...processRows, ...containerRows];
  }, [detected, containers, roots, alive, stopping]);

  const stop = useCallback(async (server: RunningServer) => {
    const { key, port, container } = server;

    if (container) {
      const stack = container.composeProject
        ? ` and the rest of the "${container.composeProject}" stack`
        : "";
      const confirmed = await ask(
        `Stop container "${container.name}"${stack}?\n\n` +
          `Data in its volumes is kept — \`docker compose up\` brings it back.`,
        { title: "Stop container", kind: "warning" },
      );
      if (!confirmed) return;

      setStopping((s) => ({ ...s, [key]: true }));
      try {
        await invoke("stop_container", { id: container.id });
      } catch {
        // The next docker poll decides whether it worked.
      }
      // Clearing eagerly would flash the row back for up to one poll; leave
      // "Stopping…" up until `docker ps` stops reporting it.
      setContainers((current) => current.filter((c) => c.id !== container.id));
      setStopping((s) => {
        const next = { ...s };
        delete next[key];
        return next;
      });
      return;
    }

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

    setStopping((s) => ({ ...s, [key]: true }));
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
          delete next[key];
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
