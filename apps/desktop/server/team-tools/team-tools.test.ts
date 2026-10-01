import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProjectModel, buildStats } from "@weave/core";
import { createTeamToolRegistry, openConnectionTools, serveMcp, type TeamToolHost } from "./index.ts";

async function refundRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "weave-tools-"));
  const files: Readonly<Record<string, string>> = {
    "package.json": JSON.stringify({ name: "fish", private: true, workspaces: ["services/*", "apps/*"] }),
    "services/payment-service/package.json": JSON.stringify({ name: "payment-service" }),
    "services/payment-service/src/webhook.ts": "export const verify = () => true;\n",
    "services/order-service/package.json": JSON.stringify({ name: "order-service" }),
    "services/order-service/src/types.ts": "export interface Refund { readonly total: string }\n",
    "apps/seller-ui/package.json": JSON.stringify({ name: "seller-ui" }),
    "apps/seller-ui/src/api.ts": 'import type { Refund } from "../../../services/order-service/src/types";\nexport const refunds: Refund[] = [];\n',
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

async function listening(host: { registry: ReturnType<typeof createTeamToolRegistry> }): Promise<{ server: Server; toolHost: TeamToolHost }> {
  const server = createServer((request, response) => void serveMcp(request, response, host.registry));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return { server, toolHost: { registry: host.registry, baseUrl: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}` } };
}

const rpc = (id: number | undefined, method: string, params?: object) => JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, ...(params ? { params } : {}) });

test("the chat's engine reaches estimate_team over HTTP and gets a worker list", async () => {
  const root = await refundRepo();
  const { model } = await buildProjectModel({ root });
  const registry = createTeamToolRegistry();
  const { server, toolHost } = await listening({ registry });
  const tools = openConnectionTools(toolHost, {
    readModel: async () => ({ ok: true, model }),
    readStats: async () => buildStats([]),
    loadRoles: async () => (task) => (task.allowedPaths.some((path) => path.startsWith("apps/")) ? "frontend-engineer" : "backend-engineer"),
    engines: [{ id: "claude-code", capabilities: {} }],
  });
  const [config] = tools.mcpServers;
  const url = config && "url" in config ? config.url : "";
  const post = (body: string) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
  try {
    const init = await (await post(rpc(1, "initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "claude", version: "1" } }))).json();
    assert.deepEqual(init.result.protocolVersion, "2025-03-26");
    assert.equal((await post(rpc(undefined, "notifications/initialized"))).status, 202);
    const listed = await (await post(rpc(2, "tools/list"))).json();
    assert.deepEqual(listed.result.tools.map((tool: { name: string }) => tool.name), ["estimate_team"]);

    const items = [
      { description: "Fix the webhook signature check", paths: ["services/payment-service/src/webhook.ts"] },
      { description: "Fix refund totals", paths: ["services/order-service/src/types.ts"] },
      { description: "Show the refund state", paths: ["apps/seller-ui/src/api.ts"] },
    ];
    const called = await (await post(rpc(3, "tools/call", { name: "estimate_team", arguments: { items } }))).json();
    const text: string = called.result.content[0].text;
    assert.equal(called.result.isError, false);
    assert.match(text, /^Recommendation: ask a team to finish \(3 workers\)\./);
    assert.match(text, /- Worker 3 \(frontend-engineer\) in apps\/seller-ui, starts after worker 2/);
    assert.equal(tools.latest()?.workers.length, 3);

    const bad = await (await post(rpc(4, "tools/call", { name: "estimate_team", arguments: { items: [{ description: "x" }] } }))).json();
    assert.equal(bad.result.isError, true);
    assert.match(bad.result.content[0].text, /needs "paths"/);
    tools.clear();
    assert.equal(tools.latest(), null);
  } finally {
    tools.close();
    server.close();
  }
});

test("the tool server refuses strangers, wrong methods, bad JSON and oversized bodies", async () => {
  const registry = createTeamToolRegistry();
  const { server, toolHost } = await listening({ registry });
  const tools = openConnectionTools(toolHost, {
    readModel: async () => ({ ok: false, message: "no model" }),
    readStats: async () => buildStats([]),
    loadRoles: async () => () => null,
    engines: [],
  });
  const [config] = tools.mcpServers;
  const url = config && "url" in config ? config.url : "";
  try {
    assert.equal((await fetch(`${toolHost.baseUrl()}/mcp/not-a-token`, { method: "POST", body: rpc(1, "ping") })).status, 404);
    assert.equal((await fetch(url)).status, 405);
    const parse = await (await fetch(url, { method: "POST", body: "{ nope" })).json();
    assert.equal(parse.error.code, -32700);
    const unknown = await (await fetch(url, { method: "POST", body: rpc(5, "resources/list") })).json();
    assert.equal(unknown.error.code, -32601);
    assert.equal((await fetch(url, { method: "POST", body: "x".repeat(70 * 1024) })).status, 413);
    tools.close();
    assert.equal((await fetch(url, { method: "POST", body: rpc(6, "ping") })).status, 404);
  } finally {
    server.close();
  }
});
