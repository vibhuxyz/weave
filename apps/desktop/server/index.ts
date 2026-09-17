import { resolve } from "node:path";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { SessionStore, weaveDirFor } from "@weave/core";
import { DEFAULT_PORT } from "./shared/index.ts";
import { handleConnection } from "./connection/index.ts";
import type { AcpServerHandle, ServerMessage } from "./shared/index.ts";

export { DEFAULT_PORT } from "./shared/index.ts";
export type {
  ClientMessage,
  ServerMessage,
  AcpServerHandle,
  GitStatus,
  GitChange,
  ConversationMeta,
} from "./shared/index.ts";

const SERVER_COMPONENT = "desktop-acp-server";

function logEvent(level: string, message: string, extra?: Record<string, unknown>): void {
  const payload = { level, component: SERVER_COMPONENT, message, ...extra };
  if (level === "error") console.error(JSON.stringify(payload));
  else console.log(JSON.stringify(payload));
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

  logEvent("info", "WebSocket server listening", { port, projectDir });

  wss.on("connection", (socket: WebSocket) => {
    void handleConnection(socket, projectDir, store).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logEvent("error", "Connection handler failed", { message });
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
      logEvent("error", "Server failed to start", {
        message: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    },
  );
}
