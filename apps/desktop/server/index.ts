import { resolve } from "node:path";
import { WebSocketServer } from "ws";
import { SessionStore, weaveDirFor } from "@weave/core";
import { DEFAULT_PORT } from "./server.constants.ts";
import { handleConnection } from "./handleConnection.ts";
import type { AcpServerHandle, ServerMessage } from "./server.types.ts";

export { DEFAULT_PORT } from "./server.constants.ts";
export type {
  ClientMessage,
  ServerMessage,
  AcpServerHandle,
  GitStatus,
  GitChange,
  ConversationMeta,
} from "./server.types.ts";

function safeSendError(socket: any, message: string): void {
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

  console.log(`[server] ws://127.0.0.1:${port}  project: ${projectDir}`);

  wss.on("connection", (socket) => {
    void handleConnection(socket, projectDir, store).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[connection]", message);
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
      console.error(error);
      process.exit(1);
    },
  );
}
