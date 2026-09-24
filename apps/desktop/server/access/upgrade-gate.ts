import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import type { WebSocket, WebSocketServer } from "ws";
import { authorizeUpgrade } from "./authorize-upgrade.ts";
import { HTTP_STATUS_TEXT, WEAVE_PROTOCOL } from "./constants.ts";
import type { RejectionStatus } from "./types.ts";

export interface UpgradeGateOptions {
  readonly httpServer: Server;
  readonly wss: WebSocketServer;
  readonly token: string;
  readonly onReject: (status: RejectionStatus, reason: string) => void;
}

function rejectUpgrade(socket: Duplex, status: RejectionStatus): void {
  socket.end(`HTTP/1.1 ${status} ${HTTP_STATUS_TEXT[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

export function selectWeaveProtocol(): string {
  return WEAVE_PROTOCOL;
}

export function attachUpgradeGate({ httpServer, wss, token, onReject }: UpgradeGateOptions): void {
  httpServer.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const decision = authorizeUpgrade(
      { origin: request.headers.origin, protocolHeader: request.headers["sec-websocket-protocol"] },
      token,
    );
    if (decision.kind === "reject") {
      onReject(decision.status, decision.reason);
      rejectUpgrade(socket, decision.status);
      return;
    }
    wss.handleUpgrade(request, socket, head, (client: WebSocket) => {
      wss.emit("connection", client, request);
    });
  });
}
