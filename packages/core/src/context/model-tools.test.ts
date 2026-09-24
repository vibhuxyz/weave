import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildProjectModel } from "./build-model.ts";
import { generateProjectDocs } from "./docs/index.ts";
import { analyzeImpact } from "./impact/index.ts";
import { queryProject } from "./query/index.ts";
import { marketplaceRepo } from "./testing.ts";
import { updateProjectModel } from "./update/index.ts";
import { searchVectors } from "./vectors/index.ts";

const LEDGER = "packages/ledger/src/index.ts#recordPayout";

test("impact of a ledger change reaches its callers, their routes, APIs and tests", async () => {
  const { model } = await buildProjectModel({ root: await marketplaceRepo() });
  const impact = analyzeImpact(model, { symbols: [LEDGER] });
  assert.deepEqual(impact.callers.map((entry) => [entry.id, entry.depth]), [
    ["apps/api/src/payouts/payout.service.ts#SellerPayoutService.createPayout", 1],
    ["apps/api/src/payouts/payout.routes.ts#createSellerPayout", 2],
  ]);
  assert.ok(impact.dependents.some((entry) => entry.id === "apps/api/src/payouts/payout.service.ts" && entry.depth === 1));
  assert.ok(impact.dependents.some((entry) => entry.id === "apps/api/src/server.ts"));
  assert.deepEqual(impact.apis.map((api) => `${api.method} ${api.path}`), ["POST /v1/sellers/:sellerId/payouts", "GET /v1/sellers/:sellerId/payouts"]);
  assert.deepEqual(impact.tests, ["apps/api/src/payouts/payout.service.test.ts"]);
  assert.deepEqual(impact.workspaces, ["@shop/ledger", "api"]);
});

test("an edit produces revision n+1 with the changed symbols and what they affect", async () => {
  const root = await marketplaceRepo();
  const weaveDir = join(root, ".weave");
  const { model } = await buildProjectModel({ root, weaveDir });
  const ledger = join(root, "packages/ledger/src/index.ts");
  await writeFile(ledger, `${await readFile(ledger, "utf8")}export function reverseEntry(entry: unknown) { return entry; }\n`.replace("return entry; }", "return { entry }; }"));
  const update = await updateProjectModel(model, { root, weaveDir });
  assert.equal(update.delta.fromRevision, 1);
  assert.equal(update.delta.toRevision, 2);
  assert.deepEqual(update.delta.files.changed, ["packages/ledger/src/index.ts"]);
  assert.deepEqual(update.delta.symbols.added, ["packages/ledger/src/index.ts#reverseEntry"]);
  assert.deepEqual(update.delta.symbols.modified, [LEDGER]);
  assert.equal(update.stats.parsed, 1);
  assert.ok(update.delta.impact.callers.some((entry) => entry.id.endsWith("SellerPayoutService.createPayout")));
  const again = await updateProjectModel(update.model, { root, weaveDir });
  assert.equal(again.delta.toRevision, 2);
  assert.equal(again.delta.symbols.modified.length, 0);
});

test("generated docs describe workspaces, APIs and the payout data flow", async () => {
  const { model } = await buildProjectModel({ root: await marketplaceRepo() });
  const docs = generateProjectDocs(model);
  assert.match(docs["architecture.md"], /\| api \| application \| apps\/api \|/);
  assert.match(docs["apis.md"], /\| POST \| \/v1\/sellers\/:sellerId\/payouts \| route \| createSellerPayout \|/);
  const flow = docs["data-flow.md"];
  assert.match(flow, /## POST \/v1\/sellers\/:sellerId\/payouts/);
  assert.match(flow, /createSellerPayout`\n  - `apps\/api\/src\/payouts\/payout.service.ts#SellerPayoutService.createPayout`\n    - `apps\/api\/src\/sellers\/seller.repo.ts#findSeller`\n    - `packages\/ledger\/src\/index.ts#recordPayout`/);
  assert.match(flow, /Events: emit `payout.created`/);
  assert.deepEqual(generateProjectDocs(model), docs);
});

test("vector search finds near-miss wording that exact terms miss", async () => {
  const { model } = await buildProjectModel({ root: await marketplaceRepo() });
  const hits = searchVectors(model, "pay-outs for merchants");
  assert.equal(hits[0]?.file.includes("payout"), true);
  const answer = queryProject(model, "vendor payouting");
  assert.ok(answer.files.some((file) => file.path.includes("payout")));
});
