import test from "node:test";
import assert from "node:assert/strict";
import type { RunUpdate } from "../../../server/index.ts";
import { MAX_BLOCK_FILES } from "./constants";
import { workerCapacityText, workerCountText } from "./lib";
import { parseRunCommand } from "./run-command";
import { applyRunMessages } from "./store/apply-run-message";
import { laneCostUsd } from "./store/lane";
import { selectRunHeader } from "./store/select-header";
import type { RunMessage } from "./types";

const started: RunMessage = { type: "run-started", runKey: "k1", request: "add helpers" };
const update = (value: RunUpdate): RunMessage => ({ type: "run-update", runKey: "k1", update: value });
const plan = update({
  kind: "plan",
  goal: null,
  assumptions: [],
  risks: [],
  mode: "parallel",
  reason: "disjoint-paths",
  tasks: [{ id: "T1", title: "add", dependsOn: [], allowedPaths: [] }, { id: "T2", title: "sub", dependsOn: ["T1"], allowedPaths: [] }],
});

test("the plan opens one waiting lane per task, in plan order", () => {
  const run = applyRunMessages(null, [started, plan]);
  assert.deepEqual(run?.laneOrder, ["T1", "T2"]);
  assert.equal(run?.lanes.T2?.status, "waiting");
  assert.deepEqual(run?.lanes.T2?.dependsOn, ["T1"]);
});

test("a lane keeps the engine, the read-only paths and the check its plan named", () => {
  const staffed = update({
    kind: "plan", goal: null, assumptions: [], risks: [], mode: "parallel", reason: "disjoint-paths",
    tasks: [{ id: "API", title: "api", dependsOn: [], allowedPaths: ["api/**"], readOnlyPaths: ["contracts/**"], engineId: "codex", employeeId: "backend-engineer", verifyRung: "typecheck" }],
  });
  const lane = applyRunMessages(null, [started, staffed])?.lanes.API;
  assert.deepEqual(lane?.readOnlyPaths, ["contracts/**"]);
  assert.equal(lane?.plannedEngineId, "codex");
  assert.equal(lane?.verifyRung, "typecheck");
  assert.deepEqual(lane?.employee, { employeeId: "backend-engineer", reasons: ["named in the plan"] });
});

test("the worker count and the constraints behind it reach the plan header", () => {
  const count = { workers: 2, limitedBy: "machine", reason: "2 workers: this machine can run 2 at a time", requested: 5, maxWorkers: 4, machineCapacity: 2, affordable: null } as const;
  const run = applyRunMessages(null, [started, plan, update({ kind: "worker-count", count })]);
  assert.deepEqual(run?.workerCount, count);
  assert.equal(workerCountText(count), "2 workers, set by this machine");
  assert.equal(workerCapacityText(count), "plan asks for 5 · project allows 4 · machine fits 2");
  assert.match(workerCapacityText({ ...count, affordable: 3 }), /cost limits afford 3$/);
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
  assert.equal(run?.lanes.T2?.status, "waiting");
  assert.deepEqual(run?.stream.map((block) => block.taskId), ["T1"]);
  assert.equal(run?.stream[0]?.turn.text, "writing add");
  assert.deepEqual(run?.stream[0]?.files, ["add.js"]);
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

test("files in one stream block stay capped, and the rest are counted", () => {
  const files = Array.from({ length: MAX_BLOCK_FILES + 2 }, (_, index) => update({ kind: "file", taskId: "T1", path: `f${index}.js` }));
  const block = applyRunMessages(null, [started, plan, ...files])?.stream[0];
  assert.equal(block?.files.length, MAX_BLOCK_FILES);
  assert.equal(block?.hiddenFileCount, 2);
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
  assert.deepEqual(selectRunHeader(idle), { runKey: null, approval: "none", request: null, outcome: null, laneOrder: [] });
});

test("planner activity streams into the chat as its own block, without opening a lane", () => {
  const run = applyRunMessages(null, [
    started,
    update({ kind: "planning", planner: "Antigravity", reviewer: "Claude Code" }),
    update({ kind: "thought", taskId: "planner", text: "Analyzing repository..." }),
    update({ kind: "tool", taskId: "planner", tool: { id: "t1", title: "Read package.json", toolKind: "read", status: "pending" } }),
    update({ kind: "text", taskId: "planner", text: '{"tasks": []}' }),
  ]);
  assert.equal(run?.planning?.planner, "Antigravity");
  assert.equal(run?.planning?.reviewer, "Claude Code");
  assert.deepEqual(run?.stream.map((block) => block.taskId), ["planner"]);
  assert.equal(run?.stream[0]?.turn.thought, "Analyzing repository...");
  assert.equal(run?.stream[0]?.turn.text, '{"tasks": []}');
  assert.equal(run?.stream[0]?.turn.tools[0]?.title, "Read package.json");
  assert.deepEqual(run?.laneOrder, []);
  assert.equal(run?.lanes.planner, undefined);
});
