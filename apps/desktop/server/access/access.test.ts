import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { authorizeUpgrade, offeredProtocols } from "./authorize-upgrade.ts";
import { parseServerToken } from "./server-token.ts";
import { attachUpgradeGate, selectWeaveProtocol } from "./upgrade-gate.ts";

const TOKEN = "a".repeat(64);
const PREVIOUS_LAUNCH_TOKEN = "b".repeat(64);
const APP_ORIGIN = "tauri://localhost";
const HOSTILE_ORIGIN = "https://evil.example";

function protocolsFor(token: string): string {
  return `weave.v1, weave.token.${token}`;
}

function decide(origin: string | undefined, protocolHeader: string | undefined) {
  return authorizeUpgrade({ origin, protocolHeader }, TOKEN);
}

function statusOf(decision: ReturnType<typeof decide>): number | null {
  return decision.kind === "reject" ? decision.status : null;
}

test("accepts the current token from the app origin", () => {
  assert.deepEqual(decide(APP_ORIGIN, protocolsFor(TOKEN)), { kind: "accept" });
});

test("fails closed when the origin is missing, even with the right token", () => {
  assert.equal(statusOf(decide(undefined, protocolsFor(TOKEN))), 403);
});

test("rejects another website with 403, even with the right token", () => {
  assert.equal(statusOf(decide(HOSTILE_ORIGIN, protocolsFor(TOKEN))), 403);
});

test("rejects a missing, wrong, truncated or previous-launch token with 401", () => {
  const offers = [
    undefined,
    "weave.v1",
    protocolsFor(PREVIOUS_LAUNCH_TOKEN),
    protocolsFor(TOKEN.slice(1)),
    protocolsFor(`${TOKEN}x`),
    `weave.token.${TOKEN}`,
  ];
  for (const offer of offers) assert.equal(statusOf(decide(APP_ORIGIN, offer)), 401, String(offer));
});

test("splits the protocol header on commas with any spacing", () => {
  assert.deepEqual(offeredProtocols(" weave.v1 ,weave.token.x "), ["weave.v1", "weave.token.x"]);
  assert.deepEqual(offeredProtocols(undefined), []);
});

test("parses a well-formed token and rejects bad ones", () => {
  assert.deepEqual(parseServerToken(TOKEN), { ok: true, token: TOKEN });
  assert.equal(parseServerToken(undefined).ok, false);
  assert.equal(parseServerToken("").ok, false);
  assert.equal(parseServerToken("short").ok, false);
  assert.equal(parseServerToken(`${"a".repeat(40)}!`).ok, false);
});

interface Harness {
  readonly url: string;
  readonly rejections: string[];
  readonly close: () => Promise<void>;
}

async function startGatedServer(): Promise<Harness> {
  const httpServer = createServer();
  const wss = new WebSocketServer({ noServer: true, handleProtocols: selectWeaveProtocol });
  const rejections: string[] = [];
  attachUpgradeGate({ httpServer, wss, token: TOKEN, onReject: (status, reason) => rejections.push(`${status} ${reason}`) });
  wss.on("connection", (socket) => socket.send("hello"));
  await new Promise<void>((done) => httpServer.listen(0, "127.0.0.1", done));
  const { port } = httpServer.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${port}`,
    rejections,
    close: () =>
      new Promise<void>((done) => {
        wss.close();
        httpServer.close(() => done());
      }),
  };
}

interface Outcome {
  readonly opened: boolean;
  readonly status: number | null;
  readonly protocol: string | null;
}

function connect(url: string, protocols: readonly string[], origin?: string): Promise<Outcome> {
  return new Promise((done) => {
    const socket = new WebSocket(url, [...protocols], origin === undefined ? {} : { headers: { Origin: origin } });
    socket.on("message", () => {
      const protocol = socket.protocol;
      socket.close();
      done({ opened: true, status: null, protocol });
    });
    socket.on("unexpected-response", (_request, response) => done({ opened: false, status: response.statusCode ?? null, protocol: null }));
    socket.on("error", () => undefined);
  });
}

test("a real socket without the right token or origin is refused before it opens", async () => {
  const server = await startGatedServer();
  try {
    const refused = { opened: false, protocol: null };
    assert.deepEqual(await connect(server.url, ["weave.v1"], APP_ORIGIN), { ...refused, status: 401 });
    assert.deepEqual(await connect(server.url, ["weave.v1", `weave.token.${PREVIOUS_LAUNCH_TOKEN}`], APP_ORIGIN), { ...refused, status: 401 });
    assert.deepEqual(await connect(server.url, ["weave.v1", `weave.token.${TOKEN}`], HOSTILE_ORIGIN), { ...refused, status: 403 });
    assert.deepEqual(await connect(server.url, ["weave.v1", `weave.token.${TOKEN}`]), { ...refused, status: 403 });
    assert.equal(server.rejections.length, 4);
    assert.equal(server.rejections.some((line) => line.includes(TOKEN)), false);
  } finally {
    await server.close();
  }
});

test("a real socket with the token connects and the server never echoes the token", async () => {
  const server = await startGatedServer();
  try {
    const outcome = await connect(server.url, ["weave.v1", `weave.token.${TOKEN}`], APP_ORIGIN);
    assert.deepEqual(outcome, { opened: true, status: null, protocol: "weave.v1" });
  } finally {
    await server.close();
  }
});
