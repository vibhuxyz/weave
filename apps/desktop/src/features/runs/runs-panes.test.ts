import test from "node:test";
import assert from "node:assert/strict";
import type { RunUpdate } from "../../../server/index.ts";
import { applyRunMessages } from "./store/apply-run-message";
import { NO_LANE_ORDER, NO_LANES, NO_STREAM, selectWorkerPanes, workerPanes } from "./store/select-panes";
import type { RunMessage } from "./types";

const started: RunMessage = { type: "run-started", runKey: "k1", request: "build a todo app" };
const update = (value: RunUpdate): RunMessage => ({ type: "run-update", runKey: "k1", update: value });
const plan = update({
  kind: "plan", goal: null, assumptions: [], risks: [], mode: "parallel", reason: "disjoint-paths",
  tasks: [
    { id: "T1", title: "api", dependsOn: [], allowedPaths: ["apps/api/**"], produces: ["todo-api-contract"] },
    { id: "T2", title: "web", dependsOn: ["T1"], allowedPaths: ["apps/web/**"] },
    { id: "T3", title: "docs", dependsOn: ["T1"], startsAfter: ["T1"], allowedPaths: ["docs/**"] },
  ],
});

const panesOf = (run: ReturnType<typeof applyRunMessages>) => selectWorkerPanes({ run });

test("every running worker gets its own pane; one that has not started yet does not", () => {
  const run = applyRunMessages(null, [started, plan, update({ kind: "task-started", taskId: "T1" }), update({ kind: "task-started", taskId: "T2" })]);
  const panes = panesOf(run);
  assert.deepEqual(panes.live.map((pane) => pane.taskId), ["T1", "T2"]);
  assert.deepEqual(panes.waiting.map((pane) => [pane.taskId, pane.waitingFor]), [["T3", "T1 to finish"]]);
});

test("a worker waiting on an artifact loses its pane and says what it is waiting for", () => {
  const run = applyRunMessages(null, [
    started, plan,
    update({ kind: "task-started", taskId: "T1" }),
    update({ kind: "task-started", taskId: "T2" }),
    update({ kind: "awaiting", taskId: "T2", output: "todo-api-contract", producer: "T1", reason: "need the routes" }),
  ]);
  const panes = panesOf(run);
  assert.deepEqual(panes.live.map((pane) => pane.taskId), ["T1"]);
  assert.deepEqual(panes.waiting.map((pane) => [pane.taskId, pane.waitingFor]), [["T2", "todo-api-contract from T1"], ["T3", "T1 to finish"]]);
});

test("the pane comes back the moment the output arrives", () => {
  const blocked = applyRunMessages(null, [
    started, plan,
    update({ kind: "task-started", taskId: "T1" }),
    update({ kind: "task-started", taskId: "T2" }),
    update({ kind: "awaiting", taskId: "T2", output: "todo-api-contract", producer: "T1", reason: "need the routes" }),
  ]);
  const resumed = applyRunMessages(blocked, [update({ kind: "awaited-arrived", taskId: "T2", output: "todo-api-contract", producer: "T1" })]);
  assert.deepEqual(panesOf(resumed).live.map((pane) => pane.taskId), ["T1", "T2"]);
  assert.deepEqual(panesOf(resumed).waiting.map((pane) => pane.taskId), ["T3"]);
});

test("a worker blocked on ownership, and a finished one, are rows rather than panes", () => {
  const run = applyRunMessages(null, [
    started, plan,
    update({ kind: "task-started", taskId: "T1" }),
    update({ kind: "task-started", taskId: "T2" }),
    update({ kind: "blocked", taskId: "T2", reason: "Waiting for T1 owns apps/api" }),
    update({ kind: "task-settled", taskId: "T1", status: "ok", reason: null, wallMs: 1000, installMs: 0 }),
  ]);
  const panes = panesOf(run);
  assert.deepEqual(panes.live.map((pane) => pane.taskId), []);
  assert.deepEqual(panes.waiting.map((pane) => [pane.taskId, pane.waitingFor]), [["T2", "Waiting for T1 owns apps/api"], ["T3", "T1 to finish"]]);
  assert.deepEqual(panes.done.map((pane) => [pane.taskId, pane.status]), [["T1", "ok"]]);
});

test("a pane carries that worker's latest turn, so the split shows live work", () => {
  const run = applyRunMessages(null, [
    started, plan,
    update({ kind: "task-started", taskId: "T1" }),
    update({ kind: "text", taskId: "T1", text: "writing the contract" }),
    update({ kind: "task-started", taskId: "T2" }),
    update({ kind: "text", taskId: "T2", text: "scaffolding the client" }),
  ]);
  const panes = panesOf(run);
  assert.deepEqual(panes.live.map((pane) => pane.block?.turn.text), ["writing the contract", "scaffolding the client"]);
  assert.deepEqual(selectWorkerPanes({ run: null }), { live: [], waiting: [], done: [] });
});

test("an idle run reads as one unchanging value, so the screen cannot loop on it", () => {
  assert.equal(selectWorkerPanes({ run: null }), selectWorkerPanes({ run: null }), "same reference, not a fresh object each read");
  assert.equal(workerPanes(NO_LANES, NO_LANE_ORDER, NO_STREAM).live.length, 0);
});
