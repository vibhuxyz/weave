import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { marketplaceRepo } from "@weave/core/context/testing.ts";
import type { ServerMessage } from "../shared/index.ts";
import { MAX_QUERY_CHARS } from "./constants.ts";
import { handleProjectMessage } from "./handle-project-message.ts";
import { createProjectModelCache } from "./model-cache.ts";

async function context() {
  const models = createProjectModelCache({ projectDir: await marketplaceRepo(), dataDir: await mkdtemp(join(tmpdir(), "weave-model-")) });
  const sent: ServerMessage[] = [];
  return { models, sent, send: (message: ServerMessage) => sent.push(message) };
}

test("the overview counts what the model found and lists workspaces with their layers", async () => {
  const ctx = await context();
  await handleProjectMessage({ type: "read-project-overview" }, ctx);
  const [message] = ctx.sent;
  assert.ok(message?.type === "project-overview", JSON.stringify(message));
  const { overview } = message;
  assert.ok(overview.counts.files > 0 && overview.counts.symbols > 0);
  assert.ok(overview.workspaces.items.length > 0);
  assert.ok(overview.workspaces.items.every((workspace) => workspace.layers.every((layer) => layer.files > 0)));
  assert.ok(overview.stack.languages.includes("TypeScript"));
});

test("a query names the files, APIs and impact of a change, straight from the repository", async () => {
  const ctx = await context();
  await handleProjectMessage({ type: "query-project", queryId: "q1", text: "Change the seller payout API" }, ctx);
  const [message] = ctx.sent;
  assert.ok(message?.type === "project-query-result", JSON.stringify(message));
  const { result } = message;
  assert.equal(message.queryId, "q1");
  assert.ok(result.files.items.some((file) => /payout/i.test(file.path)), JSON.stringify(result.files));
  assert.ok(result.apis.items.some((api) => /payout/i.test(api.path)), JSON.stringify(result.apis));
  assert.ok(result.impact.seedFiles.length > 0);
});

test("empty and oversized searches are refused with a reason", async () => {
  const ctx = await context();
  await handleProjectMessage({ type: "query-project", queryId: "q1", text: "   " }, ctx);
  await handleProjectMessage({ type: "query-project", queryId: "q2", text: "x".repeat(MAX_QUERY_CHARS + 1) }, ctx);
  assert.deepEqual(ctx.sent.map((message) => message.type), ["project-query-failed", "project-query-failed"]);
});

test("a project that cannot be modelled reports why instead of throwing", async () => {
  const models = createProjectModelCache({ projectDir: join(tmpdir(), "weave-missing-project-dir"), dataDir: await mkdtemp(join(tmpdir(), "weave-model-")) });
  const sent: ServerMessage[] = [];
  await handleProjectMessage({ type: "read-project-overview" }, { models, send: (message) => sent.push(message) });
  assert.equal(sent[0]?.type, "project-overview-failed");
});
