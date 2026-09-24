import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WeaveEvent } from "@weave/protocol";
import { Ledger, formatMicroUsd, parseUsd, readLedger } from "../shared/index.ts";
import { BudgetManager, parseBudgets } from "./budget/index.ts";
import { criticalPathMs, listSchedule } from "./estimate/index.ts";
import { buildStats, foldRun, type HistoryStats } from "./history/index.ts";
import { planOrchestration } from "./policy/index.ts";
import { routeTask, type EngineCandidate } from "./routing/index.ts";

const base = { runId: "r1", at: "t" };
let seq = 0;
const event = (fields: Record<string, unknown>): WeaveEvent => ({ ...base, seq: ++seq, ...fields }) as unknown as WeaveEvent;

function attempt(taskId: string, engineId: string, isOk: boolean, wallMs: number, costUsd: number): WeaveEvent[] {
  return [
    event({ type: "attempt.started", taskId, attemptIndex: 0, engineId, sessionId: "" }),
    event({ type: "usage", taskId, used: 1_000, size: 10_000, costUsd }),
    event({ type: "task.finished", taskId, status: isOk ? "ok" : "failed", wallMs }),
  ];
}

const decided = (tasks: readonly { taskId: string; kind: string }[]): WeaveEvent =>
  event({ type: "orchestration.decided", workers: 1, reason: "", benefitMs: {}, estimatedCostMicroUsd: "0", tasks: tasks.map((task) => ({ ...task, sizeUnits: 1, engines: [], estimatedMs: 0 })) });

function history(): HistoryStats {
  const run = (runId: string, concurrency: number, overheadMs: number): WeaveEvent[] => [
    event({ type: "run.started", runId, cwd: "", config: { concurrency } }),
    decided([{ taskId: "A", kind: "web" }, { taskId: "B", kind: "web" }]),
    ...attempt("A", "slow", false, 60_000, 0.5),
    ...attempt("A", "fast", true, 10_000, 0.1),
    ...attempt("B", "fast", true, 12_000, 0.1),
    event({ type: "pool.task.settled", taskId: "A", status: "ok", reason: null, installMs: 0, agentMs: 70_000, wallMs: 70_000 + overheadMs }),
    event({ type: "merge.finished", taskId: "A", status: "merged", commit: "c", rungs: [], detail: "" }),
    event({ type: "merge.finished", taskId: "B", status: "conflict", commit: null, rungs: [], detail: "" }),
  ];
  return buildStats([foldRun(run("r1", 1, 2_000)), foldRun(run("r2", 3, 6_000))]);
}

test("ledger history becomes per-engine success, speed, cost and overhead statistics", () => {
  const stats = history();
  assert.equal(stats.runs, 2);
  assert.deepEqual([stats.engines.get("fast")?.attempts, stats.engines.get("fast")?.successes], [4, 4]);
  assert.equal(stats.engines.get("slow")?.successes, 0);
  assert.equal(stats.engines.get("fast")?.msPerUnit, 11_000);
  assert.equal(stats.engines.get("slow")?.costMicroUsdPerUnit, 500_000n);
  assert.equal(stats.conflictRate, 0.5);
  assert.equal(stats.coordinationMsPerWorker, 2_000);
  assert.equal(stats.projectSpend.costMicroUsd, 1_400_000n);
});

test("routing puts the engine with the best success per unit of effort first and keeps the whole chain", () => {
  const candidates: EngineCandidate[] = [
    { id: "slow", capabilities: { fileEditing: true, toolCalls: true } },
    { id: "fast", capabilities: { fileEditing: true, toolCalls: true } },
    { id: "blind", capabilities: { fileEditing: true, toolCalls: true, browser: false } },
  ];
  const route = routeTask({ task: { id: "T", prompt: "x", allowedPaths: ["web/**"] }, candidates, stats: history(), msPerMicroUsd: 0 });
  assert.deepEqual(route.engines, ["fast", "blind", "slow"]);
  const needsBrowser = routeTask({ task: { id: "T", prompt: "x", capabilities: ["browser"] }, candidates, stats: history(), msPerMicroUsd: 0 });
  assert.deepEqual(needsBrowser.engines, ["slow", "fast", "blind"]);
  assert.match(needsBrowser.reason, /no engine declares browser/);
});

test("the schedule respects dependencies and the critical path bounds any worker count", () => {
  const tasks = [{ id: "A" }, { id: "B" }, { id: "C", dependencies: [{ task: "A" }] }];
  const durations: Record<string, number> = { A: 10, B: 10, C: 10 };
  const durationOf = (id: string): number => durations[id] ?? 0;
  assert.equal(listSchedule(tasks, durationOf, 1).makespanMs, 30);
  assert.equal(listSchedule(tasks, durationOf, 2).makespanMs, 20);
  assert.equal(listSchedule(tasks, durationOf, 3).makespanMs, 20);
  assert.equal(criticalPathMs(tasks, durationOf), 20);
});

test("worker count follows expected benefit, not a fixed task-count rule", () => {
  const stats = { ...history(), runs: 5, conflictRate: 0.01, coordinationMsPerWorker: 1_000, verifyMs: 5_000, startupMs: 2_000 };
  const engines: EngineCandidate[] = [{ id: "fast", capabilities: { fileEditing: true, toolCalls: true } }];
  const long = "x".repeat(4_000);
  const plan = (tasks: Parameters<typeof planOrchestration>[0]["tasks"], maxRunWallMs?: number) =>
    planOrchestration({ tasks, engines, stats, maxWorkers: 4, ...(maxRunWallMs === undefined ? {} : { maxRunWallMs }) });
  const disjointPair = plan([{ id: "A", prompt: long, allowedPaths: ["web/**"] }, { id: "B", prompt: long, allowedPaths: ["api/**"] }]);
  assert.equal(disjointPair.workers, 2);
  assert.ok(disjointPair.benefit.total > 0);
  const chain = plan([{ id: "A", prompt: long, allowedPaths: ["web/**"] }, { id: "B", prompt: long, allowedPaths: ["api/**"], dependencies: [{ task: "A" }] }]);
  assert.equal(chain.workers, 1);
  const overlapping = plan([{ id: "A", prompt: long, allowedPaths: ["src/**"] }, { id: "B", prompt: long, allowedPaths: ["src/b.ts"] }]);
  assert.equal(overlapping.workers, 1);
  const tinyTasks = [{ id: "A", prompt: "x", allowedPaths: ["web/**"] }, { id: "B", prompt: "x", allowedPaths: ["api/**"] }];
  assert.equal(plan(tinyTasks).workers, 2);
  const costlyVerify = planOrchestration({ tasks: tinyTasks, engines, stats: { ...stats, verifyMs: 20_000 }, maxWorkers: 4 });
  assert.equal(costlyVerify.workers, 1);
  assert.equal(plan(tinyTasks.concat({ id: "C", prompt: "x", allowedPaths: ["db/**"] }), 20_000).workers, 3);
});

test("budgets parse money as exact micro-dollars and reject bad input", () => {
  assert.equal(parseUsd("2.5"), 2_500_000n);
  assert.equal(parseUsd("-1"), null);
  assert.equal(formatMicroUsd(1_234_567n), "$1.234567");
  const parsed = parseBudgets({ run: { maxCostUsd: "1.00", maxWallMs: 60_000 }, engine: { codex: { maxTokens: 500 } } });
  assert.deepEqual(parsed, { ok: true, budgets: { run: { maxCostMicroUsd: 1_000_000n, maxWallMs: 60_000 }, engine: { codex: { maxTokens: 500 } } } });
  const bad = parseBudgets({ task: { maxCostUsd: 3, maxTokens: -1 } });
  assert.equal(bad.ok, false);
  assert.equal(bad.ok ? 0 : bad.issues.length, 2);
});

test("a task over its cost budget is stopped, and an exhausted employee cannot start more work", async () => {
  const weaveDir = join(await mkdtemp(join(tmpdir(), "weave-budget-")), ".weave");
  const ledger = new Ledger(weaveDir, "run1");
  const stopped: string[] = [];
  const tasks = [{ id: "A", prompt: "a", allowedPaths: ["web/**"] }, { id: "B", prompt: "b", allowedPaths: ["web/**"] }];
  const budget = new BudgetManager({ budgets: { task: { maxCostMicroUsd: 200_000n }, employee: { maxCostMicroUsd: 300_000n } }, ledger, tasks, now: () => 0 });
  budget.bind({ stopTask: (taskId) => stopped.push(taskId), stopRun: () => assert.fail("run should keep going") });
  const unwatch = budget.watch(ledger);
  budget.taskStarted("A");
  ledger.append("attempt.started", { taskId: "A", attemptIndex: 0, engineId: "codex", sessionId: "" });
  ledger.append("usage", { taskId: "A", used: 10, size: 100, costUsd: 0.1 });
  assert.deepEqual(stopped, []);
  ledger.append("usage", { taskId: "A", used: 10, size: 100, costUsd: 0.35 });
  assert.deepEqual([...new Set(stopped)], ["A"]);
  budget.taskSettled("A");
  assert.deepEqual(budget.admits("B"), { ok: false, reason: "employee budget web exceeded: cost $0.350000 of $0.300000" });
  unwatch();
  budget.dispose();
  const exceeded = (await readLedger(weaveDir, "run1")).flatMap((entry) => (entry.type === "budget.exceeded" ? [[entry.scope, entry.action]] : []));
  assert.deepEqual(exceeded, [["task", "stop-task"], ["employee", "stop-task"], ["employee", "skip-task"]]);
});
