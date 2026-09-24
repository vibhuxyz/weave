import test from "node:test";
import assert from "node:assert/strict";
import type { RunUpdate } from "../../../server/index.ts";
import { MAX_LANE_FILES, MAX_LANE_TOOLS } from "./constants";
import { parseRunCommand } from "./run-command";
import { applyRunMessages } from "./store/apply-run-message";
import { laneCostUsd } from "./store/lane";
import { selectRunHeader } from "./store/select-header";
import type { RunMessage } from "./types";

const started: RunMessage = { type: "run-started", runKey: "k1", request: "add helpers" };
const update = (value: RunUpdate): RunMessage => ({ type: "run-update", runKey: "k1", update: value });
const plan = update({
  kind: "plan",
  mode: "parallel",
  reason: "disjoint-paths",
  tasks: [{ id: "T1", title: "add", dependsOn: [] }, { id: "T2", title: "sub", dependsOn: ["T1"] }],
});

test("the plan opens one waiting lane per task, in plan order", () => {
  const run = applyRunMessages(null, [started, plan]);
  assert.deepEqual(run?.laneOrder, ["T1", "T2"]);
  assert.equal(run?.lanes.T2?.status, "waiting");
  assert.deepEqual(run?.lanes.T2?.dependsOn, ["T1"]);
});

test("each lane only takes the updates for its own taskId", () => {
  const run = applyRunMessages(null, [
    started,
    plan,
    update({ kind: "task-started", taskId: "T1" }),
    update({ kind: "text", taskId: "T1", text: "writing add" }),
    update({ kind: "file", taskId: "T1", path: "add.js" }),
    update({ kind: "task-settled", taskId: "T1", status: "ok", reason: null }),
  ]);
  assert.equal(run?.lanes.T1?.status, "ok");
  assert.equal(run?.lanes.T1?.text, "writing add");
  assert.deepEqual(run?.lanes.T1?.files, ["add.js"]);
  assert.equal(run?.lanes.T2?.status, "waiting");
  assert.equal(run?.lanes.T2?.text, "");
});

test("cost keeps the finished attempt and adds the re-run's own session cost", () => {
  const run = applyRunMessages(null, [
    started,
    plan,
    update({ kind: "task-started", taskId: "T1" }),
    update({ kind: "cost", taskId: "T1", costUsd: 0.3 }),
    update({ kind: "task-started", taskId: "T1" }),
    update({ kind: "cost", taskId: "T1", costUsd: 0.1 }),
    update({ kind: "cost", taskId: "T2", costUsd: 0.2 }),
  ]);
  const lane = run?.lanes.T1;
  assert.ok(lane);
  assert.equal(lane.attempts, 2);
  assert.ok(Math.abs(laneCostUsd(lane) - 0.4) < 1e-9);
});

test("a task outside the plan, like a contract revision, gets its own lane", () => {
  const run = applyRunMessages(null, [started, plan, update({ kind: "task-started", taskId: "contract-v2" }), update({ kind: "contract-changed", version: 2, requestedBy: "T2", rerun: ["T2"] })]);
  assert.deepEqual(run?.laneOrder, ["T1", "T2", "contract-v2"]);
  assert.equal(run?.contractVersion, 2);
});

test("lane tools and files stay capped", () => {
  const tools = Array.from({ length: MAX_LANE_TOOLS + 3 }, (_, index) => update({ kind: "tool", taskId: "T1", title: `tool ${index}` }));
  const files = Array.from({ length: MAX_LANE_FILES + 2 }, (_, index) => update({ kind: "file", taskId: "T1", path: `f${index}.js` }));
  const lane = applyRunMessages(null, [started, plan, ...tools, ...files])?.lanes.T1;
  assert.equal(lane?.tools.length, MAX_LANE_TOOLS);
  assert.equal(lane?.tools.at(-1)?.title, `tool ${MAX_LANE_TOOLS + 2}`);
  assert.equal(lane?.files.length, MAX_LANE_FILES);
  assert.equal(lane?.hiddenFileCount, 2);
});

test("updates from another run are ignored, and the outcome ends the run", () => {
  const stray: RunMessage = { type: "run-update", runKey: "old", update: { kind: "task-started", taskId: "T1" } };
  const finished: RunMessage = { type: "run-finished", runKey: "k1", outcome: { status: "refused", reason: "dirty tree" } };
  const run = applyRunMessages(null, [started, plan, stray, finished]);
  assert.equal(run?.lanes.T1?.status, "waiting");
  assert.deepEqual(run?.outcome, { status: "refused", reason: "dirty tree" });
});

test("only an exact /parallel command starts a run", () => {
  assert.equal(parseRunCommand("/parallel add three helpers "), "add three helpers");
  assert.equal(parseRunCommand("/parallel"), "");
  assert.equal(parseRunCommand("/parallelize it"), null);
  assert.equal(parseRunCommand("please /parallel this"), null);
});

test("with no run, the panel selector returns the same lane list every time, so React does not loop", () => {
  const idle = { run: null };
  assert.equal(selectRunHeader(idle).laneOrder, selectRunHeader(idle).laneOrder);
  assert.deepEqual(selectRunHeader(idle), { request: null, outcome: null, laneOrder: [] });
});
