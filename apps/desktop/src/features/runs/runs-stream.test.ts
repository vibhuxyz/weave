import test from "node:test";
import assert from "node:assert/strict";
import type { RunUpdate } from "../../../server/index.ts";
import { MAX_STREAM_BLOCKS } from "./constants";
import { applyRunMessages } from "./store/apply-run-message";
import { selectRunStream } from "./store/select-header";
import type { RunMessage } from "./types";

const started: RunMessage = { type: "run-started", runKey: "k1", request: "build todo app" };
const update = (value: RunUpdate): RunMessage => ({ type: "run-update", runKey: "k1", update: value });
const plan = update({
  kind: "plan",
  goal: null,
  assumptions: [],
  risks: [],
  mode: "parallel",
  reason: "disjoint-paths",
  tasks: [{ id: "T1", title: "server", dependsOn: [], allowedPaths: [] }, { id: "T2", title: "web", dependsOn: [], allowedPaths: [] }],
});

function streamOf(messages: readonly RunMessage[]) {
  return applyRunMessages(null, [started, plan, ...messages])?.stream ?? [];
}

test("work from two tasks interleaves into separate badged blocks", () => {
  const stream = streamOf([
    update({ kind: "text", taskId: "T1", text: "scaffolding the server" }),
    update({ kind: "text", taskId: "T2", text: "creating App.tsx" }),
    update({ kind: "text", taskId: "T1", text: " and package.json" }),
  ]);
  assert.deepEqual(stream.map((block) => block.taskId), ["T1", "T2", "T1"]);
  assert.equal(stream[0]?.turn.text, "scaffolding the server");
  assert.equal(stream[2]?.turn.text, " and package.json");
});

test("a tool call becomes a tool segment that its later update completes", () => {
  const stream = streamOf([
    update({ kind: "tool", taskId: "T1", tool: { id: "c1", title: "bun test", toolKind: "execute", status: "pending", command: "bun test" } }),
    update({ kind: "tool-update", taskId: "T1", tool: { id: "c1", status: "failed" } }),
  ]);
  const tool = stream[0]?.turn.tools[0];
  assert.equal(tool?.kind, "execute");
  assert.equal(tool?.status, "failed");
  assert.deepEqual(tool?.rawInput, { command: "bun test" });
  assert.deepEqual(stream[0]?.turn.segments, [{ id: "s0", kind: "tools", toolIds: ["c1"] }]);
});

test("a tool update lands on the block that holds the call, not the newest one", () => {
  const stream = streamOf([
    update({ kind: "tool", taskId: "T1", tool: { id: "c1", title: "bun test", toolKind: "execute", status: "pending" } }),
    update({ kind: "text", taskId: "T2", text: "meanwhile" }),
    update({ kind: "tool-update", taskId: "T1", tool: { id: "c1", status: "completed" } }),
  ]);
  assert.equal(stream.length, 2);
  assert.equal(stream[0]?.turn.tools[0]?.status, "completed");
});

test("a re-run starts a new block and counts the attempt", () => {
  const stream = streamOf([
    update({ kind: "task-started", taskId: "T1" }),
    update({ kind: "text", taskId: "T1", text: "first try" }),
    update({ kind: "task-settled", taskId: "T1", status: "failed", reason: "tests failed", wallMs: 1000, installMs: 0 }),
    update({ kind: "task-started", taskId: "T1" }),
    update({ kind: "text", taskId: "T1", text: "second try" }),
  ]);
  assert.deepEqual(stream.map((block) => [block.attempt, block.status]), [[1, "failed"], [2, "running"]]);
});

test("the stream is capped and reports how many blocks it dropped", () => {
  const messages = Array.from({ length: MAX_STREAM_BLOCKS + 3 }, (_, index) =>
    update({ kind: "text", taskId: index % 2 === 0 ? "T1" : "T2", text: `chunk ${index}` }),
  );
  const run = applyRunMessages(null, [started, plan, ...messages]);
  assert.equal(run?.stream.length, MAX_STREAM_BLOCKS);
  assert.equal(run?.hiddenBlockCount, 3);
  assert.equal(run?.stream.at(-1)?.turn.text, `chunk ${MAX_STREAM_BLOCKS + 2}`);
});

test("the stream selector returns the same block list every time, so React does not loop", () => {
  const idle = { run: null };
  assert.equal(selectRunStream(idle).blocks, selectRunStream(idle).blocks);
  assert.deepEqual(selectRunStream(idle), { blocks: [], hiddenBlockCount: 0, outcome: null, plannerLabel: null, isPlanning: false });
  const run = applyRunMessages(null, [started, plan, update({ kind: "text", taskId: "T1", text: "hi" })]);
  assert.ok(run);
  assert.equal(selectRunStream({ run }).blocks, selectRunStream({ run }).blocks);
});

test("interleaved work stays one attempt: the blocks are segments, not restarts", () => {
  const run = applyRunMessages(null, [
    started,
    plan,
    update({ kind: "task-started", taskId: "T1" }),
    update({ kind: "task-started", taskId: "T2" }),
    update({ kind: "text", taskId: "T1", text: "writing the api" }),
    update({ kind: "text", taskId: "T2", text: "scaffolding the client" }),
    update({ kind: "text", taskId: "T1", text: "and its routes" }),
    update({ kind: "text", taskId: "T2", text: "and its styles" }),
  ]);
  const blocks = run?.stream ?? [];
  assert.deepEqual(blocks.map((block) => [block.taskId, block.attempt]), [["T1", 1], ["T2", 1], ["T1", 1], ["T2", 1], ["T1", 1], ["T2", 1]]);
  assert.ok(blocks.every((block) => block.attempt === 1), "no interleaving is a restart");
  assert.equal(run?.lanes["T1"]?.attempts, 1);
});

test("a real restart is the only thing that counts as the next attempt", () => {
  const run = applyRunMessages(null, [
    started,
    plan,
    update({ kind: "task-started", taskId: "T1" }),
    update({ kind: "task-started", taskId: "T2" }),
    update({ kind: "text", taskId: "T1", text: "first go" }),
    update({ kind: "text", taskId: "T2", text: "meanwhile" }),
    update({ kind: "task-settled", taskId: "T1", status: "failed", reason: "the engine crashed", wallMs: 1000, installMs: 0 }),
    update({ kind: "task-started", taskId: "T1" }),
    update({ kind: "text", taskId: "T1", text: "second go" }),
    update({ kind: "text", taskId: "T2", text: "still going" }),
  ]);
  const blocks = run?.stream ?? [];
  assert.deepEqual(blocks.map((block) => [block.taskId, block.attempt]), [["T1", 1], ["T2", 1], ["T1", 1], ["T2", 1], ["T1", 2], ["T2", 1]]);
  assert.equal(run?.lanes["T1"]?.attempts, 2);
  assert.equal(run?.lanes["T2"]?.attempts, 1);
});
