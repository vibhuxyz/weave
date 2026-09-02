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
  | { type: "cancel" }
  | { type: "set-config"; configId: string; value: string }
  | { type: "git" };

/** Messages we send the UI. */
export type ServerMessage =
  | {
      type: "ready";
      sessionId: string;
      cwd: string;
      /**
       * The agent's own settings, e.g. `model` and `mode`. Claude Code does
       * NOT populate `newSession().models` — it advertises everything through
       * configOptions, which is also what Berd drives (`setSessionConfigOption`
       * with `configId: "model"`). Driving configOptions therefore works for
       * any ACP agent, not just this one.
       */
      configOptions: acp.SessionConfigOption[];
    }
  | { type: "update"; update: acp.SessionUpdate }
  | { type: "config-changed"; configId: string; value: string }
  | { type: "config-rejected"; configId: string; message: string }
  | { type: "git-status"; git: GitStatus }
  | { type: "turn-end"; stopReason: string }
  | { type: "error"; message: string };

export interface GitChange {
  path: string;
  /** Two-character porcelain code, e.g. " M", "A ", "??". */
  code: string;
}

export interface GitStatus {
  /** null when the project folder is not a git repo. */
  branch: string | null;
  changes: GitChange[];
}

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

/**
 * Read the project's git state by shelling out to `git`.
 *
 * Berd does this in Rust (`commands/git.rs`, 13 `Command::new("git")` calls).
 * Here the Node server is already the privileged process, so it does the same
 * job without a Tauri round-trip.
 */
async function readGitStatus(projectDir: string): Promise<GitStatus> {
  const run = (args: string[]) =>
    new Promise<string | null>((done) => {
      const child = spawn("git", args, {
        cwd: projectDir,
        stdio: ["ignore", "pipe", "ignore"],
      });
      let out = "";
      child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
      child.on("error", () => done(null));
      child.on("close", (code) => done(code === 0 ? out : null));
    });

  const branch = (await run(["rev-parse", "--abbrev-ref", "HEAD"]))?.trim();
  if (!branch) return { branch: null, changes: [] };

  const porcelain = (await run(["status", "--porcelain"])) ?? "";
  const changes = porcelain
    .split("\n")
    .filter((line) => line.length > 3)
    // Porcelain is fixed-width: 2 status chars, a space, then the path.
    .map((line) => ({ code: line.slice(0, 2), path: line.slice(3) }));

  return { branch, changes };
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

  const configOptions = session.configOptions ?? [];
  send({
    type: "ready",
    sessionId: session.sessionId,
    cwd: projectDir,
    configOptions,
  });
  console.log(
    "[session]",
    session.sessionId,
    `config: ${configOptions.map((option) => option.id).join(", ") || "none"}`,
  );

  void readGitStatus(projectDir).then((git) => send({ type: "git-status", git }));

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

    if (message.type === "git") {
      void readGitStatus(projectDir).then((git) =>
        send({ type: "git-status", git }),
      );
      return;
    }

    if (message.type === "set-config") {
      connection
        .setSessionConfigOption({
          sessionId: session.sessionId,
          configId: message.configId,
          value: message.value,
        })
        .then(() => {
          console.log("[config]", message.configId, "→", message.value);
          send({
            type: "config-changed",
            configId: message.configId,
            value: message.value,
          });
        })
        .catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          console.warn("[config] rejected", message.configId, reason);
          // Some settings only exist for some models — Claude Code advertises
          // `effort` and `fast` always, but rejects them on Haiku. The agent
          // reports that as a bare "Internal error", so say something useful
          // and let the renderer roll its optimistic value back.
          send({
            type: "config-rejected",
            configId: message.configId,
            message: `"${message.configId}" is not available for the current model.`,
          });
        });
      return;
    }

    if (message.type === "prompt") {
      connection
        .prompt({
          sessionId: session.sessionId,
          prompt: [{ type: "text", text: message.text }],
        })
        .then(async (result) => {
          send({ type: "turn-end", stopReason: result.stopReason });
          // The agent probably just edited files; refresh Changes without
          // making the UI poll for it.
          send({ type: "git-status", git: await readGitStatus(projectDir) });
        })
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
