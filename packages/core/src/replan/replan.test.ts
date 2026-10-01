import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CoordinationEvent } from "@weave/protocol";
import type { PoolReport, PoolTaskReport } from "../pool/index.ts";
import { Ledger, readLedger } from "../shared/index.ts";
import { decideReplan } from "./decide.ts";
import { parseReplanDecision } from "./parse-decision.ts";
import { coordinatorReviser } from "./reviser.ts";
import { replanTriggers } from "./triggers.ts";
import type { ReplanTask } from "./types.ts";

const TASKS: readonly ReplanTask[] = [
  { id: "DB", title: "db", prompt: "build the schema", cwd: "/repo", produces: ["schema"] },
  { id: "API", title: "api", prompt: "build the api", cwd: "/repo" },
];
const ENGINES = [
  { id: "claude-code", capabilities: { fileEditing: true, toolCalls: true } },
  { id: "codex", capabilities: { fileEditing: true, toolCalls: true } },
];

function entry(taskId: string, status: PoolTaskReport["status"], reason: string | null = null): PoolTaskReport {
  return { taskId, status, reason, branch: null, harvest: null, finalMessage: null, installMs: 0, agentMs: 0, wallMs: 0, ranIn: null, isRejected: false };
}

function poolWith(tasks: readonly PoolTaskReport[], coordination?: Partial<PoolReport["coordination"]>): PoolReport {
  return { tasks, coordination: { addedDependencies: [], escalations: [], ...coordination } };
}

const escalation: CoordinationEvent = {
  id: "e1", version: 1, seq: 1, occurredAt: "t", correlationId: "c", from: "weave",
  type: "escalation.created", data: { subject: "API needs schema", reason: "DB ended as failed without publishing schema" },
};

const fenced = (value: unknown) => "```json\n" + JSON.stringify(value) + "\n```";

test("a round where every worker finished asks the coordinator nothing", () => {
  assert.deepEqual(replanTriggers(poolWith([entry("DB", "ok"), entry("API", "ok")])), []);
});

test("failures, skips, escalations and unresolved discoveries are what wake the coordinator", () => {
  const pool = poolWith(
    [entry("DB", "failed", "migration broke"), entry("API", "skipped", "dependency DB ended as failed"), entry("UI", "ok")],
    {
      addedDependencies: [
        { taskId: "API", dependency: { task: "DB", requiredOutputs: ["schema"] } },
        { taskId: "UI", dependency: { task: "DB", requiredOutputs: ["erd"] } },
      ],
      escalations: [escalation],
    },
  );
  assert.deepEqual(replanTriggers(pool), [
    { kind: "worker-failed", taskId: "DB", detail: "failed: migration broke" },
    { kind: "worker-skipped", taskId: "API", detail: "dependency DB ended as failed" },
    { kind: "dependency-discovered", taskId: "API", detail: "needs schema from DB" },
    { kind: "escalation", taskId: "weave", detail: "API needs schema: DB ended as failed without publishing schema" },
  ]);
});

test("a decision is parsed strictly and only names tasks in the plan", async () => {
  assert.equal(parseReplanDecision("not json").ok, false);
  assert.equal(parseReplanDecision(fenced({ action: "restart", reason: "r" })).ok, false);
  assert.deepEqual(parseReplanDecision(fenced({ action: "continue", reason: "the failure changes nothing", rerun: [{ id: "DB" }] })), {
    ok: true,
    decision: { action: "continue", reason: "the failure changes nothing", rerun: [] },
  });

  const outcome = await decideReplan({
    goal: "a todo app", round: 1, tasks: TASKS, outcomes: [{ taskId: "DB", status: "failed", reason: "crashed" }],
    triggers: [{ kind: "worker-failed", taskId: "DB", detail: "crashed" }], engineIds: ENGINES.map((engine) => engine.id),
    runTurn: async () => fenced({
      action: "rerun",
      reason: "the crash looks like an engine problem",
      rerun: [{ id: "DB", engine: "codex", guidance: "keep the schema you had" }, { id: "GHOST" }, { id: "API", engine: "gemini" }],
    }),
  });
  assert.equal(outcome.decision.action, "rerun");
  assert.deepEqual(outcome.decision.rerun, [{ id: "DB", guidance: "keep the schema you had", engine: "codex" }, { id: "API" }]);
  assert.deepEqual(outcome.warnings, [
    "The coordinator asked to rerun GHOST, which is not in the plan; it was left out",
    "The coordinator asked to run API on gemini, which is not installed for this run; its usual engine order is kept",
  ]);
});

test("an engine error in place of a decision is reported as what the engine said", () => {
  const parsed = parseReplanDecision("API Error: the engine  refused this message");
  assert.equal(parsed.ok, false);
  assert.match(parsed.ok ? "" : parsed.issues.join(" "), /the engine answered: "API Error: the engine refused this message"/);
});

test("an unusable answer, twice, lets the run stand rather than blocking it", async () => {
  const prompts: string[] = [];
  const outcome = await decideReplan({
    goal: null, round: 1, tasks: TASKS, outcomes: [], triggers: [{ kind: "worker-failed", taskId: "DB", detail: "crashed" }],
    engineIds: [], runTurn: async (prompt) => (prompts.push(prompt), "nonsense"),
  });
  assert.equal(outcome.attempts, 2);
  assert.equal(outcome.decision.action, "continue");
  assert.match(prompts[1] ?? "", /Your previous answer was rejected/);
  assert.ok(outcome.warnings.length > 0);
});

test("a rerun asked for by the coordinator becomes the tasks to run again, with its guidance attached", async () => {
  const weaveDir = join(await mkdtemp(join(tmpdir(), "weave-replan-")), ".weave");
  const ledger = new Ledger(weaveDir, "run1");
  const prompts: string[] = [];
  const revise = coordinatorReviser({
    tasks: TASKS, engineCandidates: ENGINES, goal: "a todo app", ledger,
    openTurn: async () => ({
      runTurn: async (prompt) => {
        prompts.push(prompt);
        return fenced({ action: "rerun", reason: "DB crashed on claude-code", rerun: [{ id: "DB", engine: "codex", guidance: "the  schema   was fine" }] });
      },
      close: async () => undefined,
    }),
  });

  const quiet = await revise({ pool: poolWith([entry("DB", "ok")]), baseCommit: "c0", round: 1, freshTaskIds: new Set(["DB"]) });
  assert.equal(quiet, null);
  assert.deepEqual(prompts, []);

  const revision = await revise({ pool: poolWith([entry("DB", "failed", "crashed")]), baseCommit: "c0", round: 1, freshTaskIds: new Set(["DB"]) });
  assert.equal(revision?.baseCommit, "c0");
  assert.deepEqual(revision?.rerun.map((task) => task.id), ["DB"]);
  const rerun = revision?.rerun[0];
  assert.equal(rerun?.engine, "codex");
  assert.match(rerun?.prompt ?? "", /^build the schema\n\n<coordinator-note round="1">/);
  assert.match(rerun?.prompt ?? "", /the schema was fine\n<\/coordinator-note>$/);
  assert.match(prompts[0] ?? "", /<what-happened>\n- \[worker-failed\] DB: failed: crashed/);

  const events = await readLedger(weaveDir, "run1");
  const requested = events.find((event) => event.type === "replan.requested");
  const decided = events.find((event) => event.type === "replan.decided");
  assert.deepEqual(requested?.type === "replan.requested" ? requested.triggers : null, [{ kind: "worker-failed", taskId: "DB", detail: "failed: crashed" }]);
  assert.deepEqual(decided?.type === "replan.decided" ? { action: decided.action, rerun: decided.rerun, warnings: decided.warnings } : null, {
    action: "rerun", rerun: [{ id: "DB", engine: "codex" }], warnings: [],
  });
});

test("a revision from the next reviser wins, and the coordinator is never asked", async () => {
  const weaveDir = join(await mkdtemp(join(tmpdir(), "weave-replan-next-")), ".weave");
  const ledger = new Ledger(weaveDir, "run1");
  let asked = 0;
  const revise = coordinatorReviser({
    tasks: TASKS, engineCandidates: ENGINES, goal: null, ledger,
    openTurn: async () => ({ runTurn: async () => (asked += 1, "{}"), close: async () => undefined }),
    next: async () => ({ baseCommit: "c1", rerun: [TASKS[1] ?? TASKS[0]].flatMap((task) => (task ? [task] : [])) }),
  });
  const revision = await revise({ pool: poolWith([entry("DB", "failed", "crashed")]), baseCommit: "c0", round: 1, freshTaskIds: new Set() });
  assert.equal(revision?.baseCommit, "c1");
  assert.equal(asked, 0);
  assert.deepEqual((await readLedger(weaveDir, "run1").catch(() => [])).length, 0);
});
