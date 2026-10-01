import test from "node:test";
import assert from "node:assert/strict";
import { buildStats } from "../adaptive/index.ts";
import { areaOf, workspaceDirsOf } from "./area-of.ts";
import { estimateTeam, parseWorkItems, renderEstimate, renderEstimateNotes, type WorkItem } from "./index.ts";

const WORKSPACES = [{ dir: "services/payment-service" }, { dir: "services/order-service" }, { dir: "apps/seller-ui" }, { dir: "packages/shared" }, { dir: "." }];
const IMPORTS = [{ from: "apps/seller-ui/src/api.ts", to: "services/order-service/src/types.ts" }];
const REFUND_BUG: readonly WorkItem[] = [
  { description: "Fix the webhook signature check", paths: ["services/payment-service/src/webhook.ts"] },
  { description: "Fix refund totals", paths: ["services/order-service/src/refund.ts"] },
  { description: "Show the refund state", paths: ["apps/seller-ui/src/orders/Refund.tsx"] },
  { description: "Round refunds with toMoney()", paths: ["services/payment-service/src/money.ts"] },
];

function estimate(items: readonly WorkItem[]) {
  return estimateTeam({
    items,
    workspaces: WORKSPACES,
    imports: IMPORTS,
    stats: buildStats([]),
    engines: [{ id: "claude-code", capabilities: {} }],
    maxWorkers: 4,
    roleOf: (task) => (task.allowedPaths.some((path) => path.startsWith("apps/")) ? "frontend-engineer" : "backend-engineer"),
  });
}

test("remaining work across three services becomes three workers, ordered by what imports what", () => {
  const result = estimate(REFUND_BUG);
  assert.equal(result.recommendation, "team");
  assert.deepEqual(result.workers.map((worker) => [worker.worker, worker.role, worker.areas, worker.items, worker.after]), [
    [1, "backend-engineer", ["services/payment-service"], ["Fix the webhook signature check", "Round refunds with toMoney()"], []],
    [2, "backend-engineer", ["services/order-service"], ["Fix refund totals"], []],
    [3, "frontend-engineer", ["apps/seller-ui"], ["Show the refund state"], [2]],
  ]);
  assert.ok(result.teamMs < result.oneWorkerMs, `${result.teamMs} < ${result.oneWorkerMs}`);
  assert.equal(result.isRough, true);
});

test("work in one area says keep going", () => {
  const result = estimate([REFUND_BUG[0] as WorkItem, REFUND_BUG[3] as WorkItem]);
  assert.equal(result.recommendation, "keep-going");
  assert.equal(result.reason, "All the remaining work is in services/payment-service, so one worker is enough.");
  assert.equal(result.workers.length, 1);
});

test("an item that touches two areas keeps them with one worker", () => {
  const result = estimate([
    { description: "Rename the Refund type", paths: ["packages/shared/src/refund.ts", "services/order-service/src/refund.ts"] },
    { description: "Fix refund totals", paths: ["services/order-service/src/totals.ts"] },
    { description: "Fix the webhook", paths: ["services/payment-service/src/webhook.ts"] },
  ]);
  assert.deepEqual(result.workers.map((worker) => worker.areas), [["packages/shared", "services/order-service"], ["services/payment-service"]]);
});

test("paths outside any workspace fall back to their top folders", () => {
  const dirs = workspaceDirsOf([{ dir: "." }]);
  assert.deepEqual([areaOf("src/api/app.ts", dirs), areaOf("src/ui/App.tsx", dirs), areaOf("docs/guide.md", dirs), areaOf("README.md", dirs)], ["src/api", "src/ui", "docs", "."]);
  assert.equal(areaOf("./services/order-service/src/a.ts", workspaceDirsOf(WORKSPACES)), "services/order-service");
});

test("the tool input is checked item by item", () => {
  assert.deepEqual(parseWorkItems({ items: [{ description: " Fix  refunds ", paths: ["a.ts", 3] }] }), { ok: true, items: [{ description: "Fix refunds", paths: ["a.ts"] }] });
  assert.match(parseWorkItems({ items: [] }).ok ? "" : "empty", /empty/);
  const missing = parseWorkItems({ items: [{ description: "x" }, { paths: ["a"] }] });
  assert.equal(missing.ok ? "" : missing.issue, 'item 1 needs "paths": the files or folders it will change; item 2 needs a "description"');
  assert.match(parseWorkItems({ items: Array.from({ length: 21 }, () => ({ description: "x", paths: ["a"] })) }).ok ? "" : "too many", /too many/);
});

test("the estimate reads as a worker list, and reaches the coordinator as computed facts", () => {
  const text = renderEstimate(estimate(REFUND_BUG));
  assert.match(text, /^Recommendation: ask a team to finish \(3 workers\)\.\nWhy: The work splits into 3 groups/);
  assert.match(text, /\n- Worker 3 \(frontend-engineer\) in apps\/seller-ui, starts after worker 2, about \d+ min: Show the refund state$/);
  assert.match(text, /Rough: only 0 past run\(s\)/);
  assert.match(renderEstimateNotes(estimate(REFUND_BUG)), /^<weave-estimate source="computed by Weave[^"]*">\nRecommendation:/);
});
