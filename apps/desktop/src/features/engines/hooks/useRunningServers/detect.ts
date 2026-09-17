import type { ChatTurn } from "@/features/chat/hooks";
import type { DetectedServer } from "./types";

/**
 * macOS squats on well-known ports for its own services — 5000 and 7000 are
 * AirPlay Receiver (Control Center) — so a dev server that failed to bind its
 * port (or hasn't started yet) can show *that* as the listener instead. It is
 * never the server the agent started, so it should never read as "running".
 */
export function isSystemProcess(command: string): boolean {
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

export const KNOWN_SERVICES: Record<number, string> = {
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
export function detect(
  turns: ChatTurn[],
  fallbackProject?: string,
): DetectedServer[] {
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

export const basename = (dir: string) =>
  dir.replace(/\/+$/, "").split("/").pop() || undefined;

/** Is `dir` at or below `root`? Both are absolute paths from Docker/Tauri. */
export function isUnder(dir: string, root: string): boolean {
  const a = dir.replace(/\/+$/, "");
  const b = root.replace(/\/+$/, "");
  return a === b || a.startsWith(`${b}/`);
}
