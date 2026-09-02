/**
 * ACP server.
 *
 * Spawns `claude-agent-acp`, speaks ACP over its stdin/stdout, and relays the
 * conversation to the UI over a WebSocket.
 *
 * Run standalone:   pnpm server
 * Embedded:         import { startAcpServer } from "./index.ts"  (Electron main)
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import * as acp from "@agentclientprotocol/sdk";

const require = createRequire(import.meta.url);

export const DEFAULT_PORT = 8137;

/** Messages the UI sends us. */
export type ClientMessage =
  | { type: "prompt"; text: string }
  | { type: "cancel" };

/** Messages we send the UI. */
export type ServerMessage =
  | { type: "ready"; sessionId: string; cwd: string }
  | { type: "update"; update: acp.SessionUpdate }
  | { type: "turn-end"; stopReason: string }
  | { type: "error"; message: string };

/**
 * Resolve the agent's entry script from node_modules.
 *
 * We run it with the *current* Node binary rather than the `.bin` shim so this
 * still works inside a packaged Electron app, where there is no shell PATH and
 * `process.execPath` is Electron itself (ELECTRON_RUN_AS_NODE makes it behave
 * as plain Node).
 */
function resolveAgentEntry(): string {
  // Not require.resolve(pkg): the package's exports["."] points at dist/lib.js
  // (the library). The ACP server we want is the *bin* entry, dist/index.js.
  // Read it from the manifest rather than hardcoding the path.
  const manifestPath = require.resolve(
    "@agentclientprotocol/claude-agent-acp/package.json",
  );
  const manifest = require(manifestPath) as { bin?: Record<string, string> };
  const relative = manifest.bin?.["claude-agent-acp"];
  if (!relative) throw new Error("claude-agent-acp bin not found in manifest");
  return resolve(dirname(manifestPath), relative);
}

/** Confine every file operation to the project directory. */
function safeResolve(projectDir: string, requestedPath: string): string {
  const absolute = isAbsolute(requestedPath)
    ? requestedPath
    : resolve(projectDir, requestedPath);
  const root = resolve(projectDir);
  if (absolute !== root && !absolute.startsWith(root + "/")) {
    throw new Error(`Refused path outside the project: ${requestedPath}`);
  }
  return absolute;
}

class UiClient implements acp.Client {
  // Plain fields, not constructor parameter properties: Node's
  // --experimental-strip-types runs in strip-only mode and rejects those.
  readonly projectDir: string;
  readonly send: (message: ServerMessage) => void;

  constructor(projectDir: string, send: (message: ServerMessage) => void) {
    this.projectDir = projectDir;
    this.send = send;
  }

  /**
   * Auto-approve, but deliberately: pick the option the agent itself labelled
   * as an allow. Never index blindly into options[0] — the order is the
   * agent's choice, and picking a reject kind means it asks forever and never
   * edits a file.
   */
  async requestPermission(
    params: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse> {
    const allow =
      params.options.find((option) => option.kind === "allow_always") ??
      params.options.find((option) => option.kind === "allow_once");

    if (!allow) {
      console.warn(
        "[permission] no allow option offered for:",
        params.toolCall.title,
      );
      return { outcome: { outcome: "cancelled" } };
    }

    console.log(`[permission] auto-allow (${allow.kind}):`, params.toolCall.title);
    return { outcome: { outcome: "selected", optionId: allow.optionId } };
  }

  async sessionUpdate(params: acp.SessionNotification): Promise<void> {
    this.send({ type: "update", update: params.update });
  }

  async readTextFile(
    params: acp.ReadTextFileRequest,
  ): Promise<acp.ReadTextFileResponse> {
    const path = safeResolve(this.projectDir, params.path);
    const text = await readFile(path, "utf8");

    // `line` is 1-based; `limit` counts lines from there.
    if (params.line == null && params.limit == null) return { content: text };
    const lines = text.split("\n");
    const start = Math.max(0, (params.line ?? 1) - 1);
    const end = params.limit == null ? undefined : start + params.limit;
    return { content: lines.slice(start, end).join("\n") };
  }

  async writeTextFile(
    params: acp.WriteTextFileRequest,
  ): Promise<acp.WriteTextFileResponse> {
    const path = safeResolve(this.projectDir, params.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, params.content, "utf8");
    console.log("[write]", path);
    return {};
  }
}

export interface AcpServerHandle {
  port: number;
  close(): Promise<void>;
}

export async function startAcpServer(options: {
  projectDir: string;
  port?: number;
}): Promise<AcpServerHandle> {
  const projectDir = resolve(options.projectDir);
  const port = options.port ?? DEFAULT_PORT;
  const wss = new WebSocketServer({ port, host: "127.0.0.1" });

  console.log(`[server] ws://127.0.0.1:${port}  project: ${projectDir}`);

  // One agent process + one ACP session per connected UI.
  wss.on("connection", (socket) => {
    void handleConnection(socket, projectDir).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[connection]", message);
      safeSend(socket, { type: "error", message });
    });
  });

  return {
    port,
    close: () =>
      new Promise<void>((done) => {
        wss.close(() => done());
      }),
  };
}

function safeSend(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(message));
}

async function handleConnection(
  socket: WebSocket,
  projectDir: string,
): Promise<void> {
  const send = (message: ServerMessage) => safeSend(socket, message);

  // stdin + stdout are "pipe" because ACP itself rides on them.
  // stderr is "inherit" on purpose: it carries the agent's crash output, and
  // piping it without draining would both hide errors and eventually block
  // the child on a full pipe buffer.
  const agent = spawn(process.execPath, [resolveAgentEntry()], {
    cwd: projectDir,
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });

  agent.on("exit", (code, signal) => {
    console.log(`[agent] exited code=${code} signal=${signal}`);
    if (socket.readyState === socket.OPEN) socket.close();
  });

  // The agent may still be mid-write when we tear the pipes down. Without
  // these, that surfaces as an unhandled EPIPE that crashes the process.
  agent.stdin.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") console.error("[agent stdin]", error);
  });
  agent.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code !== "EPIPE") console.error("[agent stdout]", error);
  });

  // ndJsonStream(output, input): output is what we write TO the agent (its
  // stdin); input is what we read FROM it (its stdout).
  const stream = acp.ndJsonStream(
    Writable.toWeb(agent.stdin) as WritableStream<Uint8Array>,
    Readable.toWeb(agent.stdout) as ReadableStream<Uint8Array>,
  );

  const connection = new acp.ClientSideConnection(
    () => new UiClient(projectDir, send),
    stream,
  );

  await connection.initialize({
    protocolVersion: acp.PROTOCOL_VERSION,
    clientCapabilities: {
      // Without these the agent can read and suggest, but never apply a fix.
      fs: { readTextFile: true, writeTextFile: true },
    },
  });

  const session = await connection.newSession({
    cwd: projectDir,
    mcpServers: [],
  });

  send({ type: "ready", sessionId: session.sessionId, cwd: projectDir });
  console.log("[session]", session.sessionId);

  socket.on("message", (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      send({ type: "error", message: "Malformed message" });
      return;
    }

    if (message.type === "cancel") {
      void connection.cancel({ sessionId: session.sessionId });
      return;
    }

    if (message.type === "prompt") {
      connection
        .prompt({
          sessionId: session.sessionId,
          prompt: [{ type: "text", text: message.text }],
        })
        .then((result) => send({ type: "turn-end", stopReason: result.stopReason }))
        .catch((error: unknown) =>
          send({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          }),
        );
    }
  });

  socket.on("close", () => {
    // Close stdin so the agent sees EOF and exits on its own; only force-kill
    // if it is still alive shortly after.
    agent.stdin.end();
    const forceKill = setTimeout(() => agent.kill("SIGKILL"), 2000);
    agent.once("exit", () => clearTimeout(forceKill));
  });
}

// Standalone entry: `pnpm server`
const isDirectRun =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  const projectDir = process.env.PROJECT_DIR ?? process.cwd();
  startAcpServer({ projectDir }).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
