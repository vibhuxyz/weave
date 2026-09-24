import { createServer } from "node:http";
import type { Server } from "node:http";
import { resolve } from "node:path";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import { SERVER_TOKEN_ENV, attachUpgradeGate, parseServerToken, selectWeaveProtocol } from "./access/index.ts";
import { DEFAULT_PORT } from "./shared/index.ts";
import { handleConnection, openProjectStorage } from "./connection/index.ts";
import { addLogSink, createFileSink, createLogger, parseLogLevel, setLogLevel } from "./logging/index.ts";
import type { AcpServerHandle, ServerMessage } from "./shared/index.ts";
import { WEAVE_HOME_ENV } from "./storage/index.ts";

export { DEFAULT_PORT } from "./shared/index.ts";
export type {
  ClientMessage,
  ServerMessage,
  AcpServerHandle,
  GitStatus,
  GitChange,
  ConversationMeta,
  ArchivedChatMeta,
  EngineAuthState,
  EngineEntry,
  PermissionOption,
  QuestionAnswerValue,
  QuestionField,
  QuestionOption,
  SetupConsent,
  QuestionNotice,
  RunOutcome,
  RunPlanTask,
  RunTaskStatus,
  RunUpdate,
} from "./shared/index.ts";
export type { SessionModes, SessionModeInfo, TerminalKeyName, ConsentLink } from "@weave/agent";

const LOOPBACK_HOST = "127.0.0.1";
const HTTP_UPGRADE_REQUIRED = 426;

const log = createLogger("server");

function openLogFile(logsDir: string): string | null {
  const level = parseLogLevel(process.env.WEAVE_LOG_LEVEL);
  if (level) setLogLevel(level);
  const file = createFileSink(logsDir);
  if (!file) return null;
  addLogSink(file.sink);
  return file.path;
}

function safeSendError(socket: WebSocket, message: string): void {
  if (socket.readyState !== socket.OPEN) return;
  const errorMsg: ServerMessage = { type: "error", message };
  socket.send(JSON.stringify(errorMsg));
}

function listenOnLoopback(httpServer: Server, port: number): Promise<void> {
  return new Promise<void>((done, fail) => {
    httpServer.once("error", fail);
    httpServer.listen(port, LOOPBACK_HOST, () => {
      httpServer.off("error", fail);
      done();
    });
  });
}

export async function startAcpServer(options: {
  readonly projectDir: string;
  readonly token: string;
  readonly port?: number;
}): Promise<AcpServerHandle> {
  const projectDir = resolve(options.projectDir);
  const port = options.port ?? DEFAULT_PORT;
  const httpServer = createServer((_request, response) => {
    response.writeHead(HTTP_UPGRADE_REQUIRED).end();
  });
  const wss = new WebSocketServer({ noServer: true, handleProtocols: selectWeaveProtocol });
  const opened = await openProjectStorage({ projectDir, weaveHome: process.env[WEAVE_HOME_ENV], now: Date.now });
  const logFile = openLogFile(opened.logsDir);

  attachUpgradeGate({
    httpServer,
    wss,
    token: options.token,
    onReject: (status, reason) => log.warn("WebSocket connection refused", { status, reason }),
  });

  httpServer.on("error", (error: Error) => {
    log.error("WebSocket server failed", { port, error });
  });

  wss.on("connection", (socket: WebSocket) => {
    void handleConnection(socket, projectDir, opened.storage).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      log.error("Connection handler failed", { message });
      safeSendError(socket, message);
    });
  });

  await listenOnLoopback(httpServer, port);
  log.info("WebSocket server listening", { port, projectDir, projectId: opened.projectId, logFile });

  return {
    port,
    close: () =>
      new Promise<void>((done) => {
        wss.close();
        httpServer.close(() => {
          opened.close();
          done();
        });
      }),
  };
}

const isDirectRun =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

function startFromEnvironment(): Promise<AcpServerHandle> {
  const token = parseServerToken(process.env[SERVER_TOKEN_ENV]);
  if (!token.ok) return Promise.reject(new Error(token.reason));
  return startAcpServer({ projectDir: process.env.PROJECT_DIR ?? process.cwd(), token: token.token });
}

if (isDirectRun) {
  startFromEnvironment().catch((error: unknown) => {
    log.error("Server failed to start", { error });
    process.exit(1);
  });
}
