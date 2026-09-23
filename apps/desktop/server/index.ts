import { join, resolve } from "node:path";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { SessionStore, weaveDirFor } from "@weave/core";
import { DEFAULT_PORT } from "./shared/index.ts";
import { handleConnection } from "./connection/index.ts";
import { addLogSink, createFileSink, createLogger, parseLogLevel, setLogLevel } from "./logging/index.ts";
import type { AcpServerHandle, ServerMessage } from "./shared/index.ts";

export { DEFAULT_PORT } from "./shared/index.ts";
export type {
  ClientMessage,
  ServerMessage,
  AcpServerHandle,
  GitStatus,
  GitChange,
  ConversationMeta,
  EngineAuthState,
  EngineEntry,
  PermissionOption,
  SetupConsent,
} from "./shared/index.ts";
export type { SessionModes, SessionModeInfo, TerminalKeyName, ConsentLink } from "@weave/agent";

const LOG_DIR_NAME = "logs";

const log = createLogger("server");

function openLogFile(projectDir: string): string | null {
  const level = parseLogLevel(process.env.WEAVE_LOG_LEVEL);
  if (level) setLogLevel(level);
  const file = createFileSink(join(weaveDirFor(projectDir), LOG_DIR_NAME));
  if (!file) return null;
  addLogSink(file.sink);
  return file.path;
}

function safeSendError(socket: WebSocket, message: string): void {
  if (socket.readyState !== socket.OPEN) return;
  const errorMsg: ServerMessage = { type: "error", message };
  socket.send(JSON.stringify(errorMsg));
}

export async function startAcpServer(options: {
  readonly projectDir: string;
  readonly port?: number;
}): Promise<AcpServerHandle> {
  const projectDir = resolve(options.projectDir);
  const port = options.port ?? DEFAULT_PORT;
  const wss = new WebSocketServer({ port, host: "127.0.0.1" });
  const store = new SessionStore(weaveDirFor(projectDir));
  const logFile = openLogFile(projectDir);

  log.info("WebSocket server listening", { port, projectDir, logFile });

  wss.on("error", (error: Error) => {
    log.error("WebSocket server failed", { port, error });
  });

  wss.on("connection", (socket: WebSocket) => {
    void handleConnection(socket, projectDir, store).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      log.error("Connection handler failed", { message });
      safeSendError(socket, message);
    });
  });

  return {
    port,
    close: () => new Promise<void>((done) => wss.close(() => done())),
  };
}

const isDirectRun =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  startAcpServer({ projectDir: process.env.PROJECT_DIR ?? process.cwd() }).catch(
    (error: unknown) => {
      log.error("Server failed to start", { error });
      process.exit(1);
    },
  );
}
