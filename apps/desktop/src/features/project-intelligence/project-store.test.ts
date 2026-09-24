import test from "node:test";
import assert from "node:assert/strict";
import { useProjectStore } from "./store";

test("a reply to an older search is ignored once a newer one is running", () => {
  const store = useProjectStore.getState();
  store.reset();
  store.startQuery("q1", "payouts");
  store.startQuery("q2", "orders");
  useProjectStore.getState().receive({ type: "project-query-failed", queryId: "q1", message: "stale" });
  assert.deepEqual(useProjectStore.getState().query, { status: "loading", queryId: "q2", text: "orders" });
  useProjectStore.getState().receive({ type: "project-query-failed", queryId: "q2", message: "nothing" });
  assert.deepEqual(useProjectStore.getState().query, { status: "error", queryId: "q2", message: "nothing" });
});

test("a loaded overview stays on screen while it refreshes, and a failure replaces it", () => {
  const store = useProjectStore.getState();
  store.reset();
  store.startOverview();
  assert.equal(useProjectStore.getState().overview.status, "loading");
  const overview = { revision: 1, repository: { isGitRepo: true, branch: "main", head: "abc" }, stack: { languages: [], frameworks: [], packageManager: null }, counts: { files: 1, symbols: 0, imports: 0, calls: 0, apis: 0, events: 0, externalPackages: 0 }, workspaces: { items: [], hidden: 0 }, recentChanges: { items: [], hidden: 0 }, skipped: { items: [], hidden: 0 } };
  useProjectStore.getState().receive({ type: "project-overview", overview });
  useProjectStore.getState().startOverview();
  assert.equal(useProjectStore.getState().overview.status, "ready");
  useProjectStore.getState().receive({ type: "project-overview-failed", message: "boom" });
  assert.deepEqual(useProjectStore.getState().overview, { status: "error", message: "boom" });
});
