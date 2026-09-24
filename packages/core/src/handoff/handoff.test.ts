import test from "node:test";
import assert from "node:assert/strict";
import type { EngineDescriptor } from "@weave/agent";
import type { Checkpoint } from "../checkpoint/index.ts";
import type { TaskState } from "@weave/protocol";
import { EMPTY_GIT_STATE } from "@weave/protocol";
import { emptyTaskState } from "../state/index.ts";
import { buildBrief } from "./handoff.ts";

const NEXT_ENGINE = { id: "codex", label: "Codex" } as EngineDescriptor;

function baseState(overrides: Partial<TaskState> = {}): TaskState {
  return {
    ...emptyTaskState("T1", "Build a Todo API"),
    atSeq: 42,
    status: "paused",
    completed: ["Scaffold server"],
    currentStep: "Implementing POST /todos",
    nextStep: "Add tests",
    remaining: ["Add tests"],
    changedFiles: { modified: ["apps/api/src/server.ts", "packages/db/schema.prisma"], created: [], deleted: [] },
    commands: [{ command: "tsc --noEmit", ok: true, wallMs: 1200 }],
    verification: [{ rung: "typecheck", status: "passed", wallMs: 1200 }],
    inFlight: [
      {
        toolCallId: "tc-2",
        title: "Edit todos.ts",
        kind: "edit",
        locations: ["apps/api/src/todos.ts"],
        startedAtSeq: 40,
      },
    ],
    gitState: { branch: "weave/T1", baseCommit: "abc123f0", headCommit: "abc123f0", dirty: ["apps/api/src/server.ts"] },
    ...overrides,
  };
}

function checkpointOf(state: TaskState): Checkpoint {
  return {
    schemaVersion: 1,
    id: String(state.atSeq),
    taskId: state.taskId,
    seq: state.atSeq,
    reason: "user_cancellation",
    createdAt: "2026-09-13T00:00:00.000Z",
    state,
  };
}

test("buildBrief renders the goal verbatim, changed files, verification, and the unfinished edit", () => {
  const brief = buildBrief(checkpointOf(baseState()), NEXT_ENGINE);

  assert.match(brief, /^TASK\nBuild a Todo API/);
  assert.match(brief, /CHANGED\n {2}apps\/api\/src\/server\.ts\n {2}packages\/db\/schema\.prisma/);
  assert.match(brief, /VERIFIED.*\n {2}typecheck {3}passed rung 3/);
  assert.match(brief, /UNFINISHED — verify before trusting\n {2}apps\/api\/src\/todos\.ts/);
  assert.match(brief, /WAS DOING\nImplementing POST \/todos/);
  assert.match(brief, /FIRST INSTRUCTION\nRead the changed files/);
  assert.doesNotMatch(brief, /CLAIMED BY THE PREVIOUS WORKER/);
});

test("buildBrief sections CLAIMED separately from VERIFIED, and marks it a hint", () => {
  const state = baseState({
    decisions: [{ description: "Using Prisma with PostgreSQL", claimed: true, atSeq: 10 }],
  });
  const brief = buildBrief(checkpointOf(state), NEXT_ENGINE);
  assert.match(brief, /CLAIMED BY THE PREVIOUS WORKER {2}\(unverified — treat as hints\)\n {2}"Using Prisma with PostgreSQL"/);
});

test("buildBrief stays under the 4KB cap on a task with 40+ turns, without dropping goal, CHANGED, or UNFINISHED", () => {
  const state = baseState({
    completed: Array.from({ length: 60 }, (_, i) => `Step ${i}: did a thing with a moderately long description`),
    decisions: Array.from({ length: 30 }, (_, i) => ({
      description: `Claim number ${i}, a moderately long musing about intent`,
      claimed: true as const,
      atSeq: i,
    })),
    verification: Array.from({ length: 20 }, (_, i) => ({
      rung: "typecheck" as const,
      status: "passed" as const,
      wallMs: 1000 + i,
    })),
  });
  const brief = buildBrief(checkpointOf(state), NEXT_ENGINE);

  assert.ok(Buffer.byteLength(brief, "utf8") <= 4096, `brief is ${Buffer.byteLength(brief, "utf8")} bytes`);
  assert.match(brief, /TASK\nBuild a Todo API/);
  assert.match(brief, /CHANGED\n {2}apps\/api\/src\/server\.ts/);
  assert.match(brief, /UNFINISHED — verify before trusting\n {2}apps\/api\/src\/todos\.ts/);
});

test("buildBrief is reproducible: same checkpoint, same string", () => {
  const checkpoint = checkpointOf(baseState());
  assert.equal(buildBrief(checkpoint, NEXT_ENGINE), buildBrief(checkpoint, NEXT_ENGINE));
});

test("buildBrief on an empty task still renders every required section", () => {
  const state = baseState({
    completed: [],
    currentStep: null,
    nextStep: null,
    changedFiles: { modified: [], created: [], deleted: [] },
    commands: [],
    verification: [],
    inFlight: [],
    gitState: EMPTY_GIT_STATE,
  });
  const brief = buildBrief(checkpointOf(state), NEXT_ENGINE);
  assert.match(brief, /CHANGED\n {2}\(no files changed\)/);
  assert.match(brief, /VERIFIED.*\n {2}\(nothing verified yet\)/);
  assert.doesNotMatch(brief, /UNFINISHED/);
});
