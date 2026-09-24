import type { WeaveEvent } from "@weave/protocol";
import { usdToMicro } from "../../shared/index.ts";
import { kindOfPaths, sizeUnitsOf } from "../estimate/index.ts";
import type { AttemptRecord, EmployeeTaskRecord, RunHistory, SettledRecord } from "./types.ts";

interface OpenAttempt {
  readonly engineId: string;
  readonly costMicroUsd: bigint;
  readonly tokens: number;
}

interface FoldState {
  runId: string;
  concurrency: number;
  readonly kinds: Map<string, string>;
  readonly sizes: Map<string, number>;
  readonly open: Map<string, OpenAttempt>;
  readonly attempts: AttemptRecord[];
  readonly settled: SettledRecord[];
  merges: number;
  conflicts: number;
  pendingVerifyMs: number;
  readonly verifyMs: number[];
  readonly employees: Map<string, string>;
  readonly employeeTasks: EmployeeTaskRecord[];
}

function concurrencyOf(config: Record<string, unknown>): number {
  const value = config["concurrency"];
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

function rememberFirst<T>(map: Map<string, T>, taskId: string, value: T): void {
  if (!map.has(taskId)) map.set(taskId, value);
}

function closeAttempt(state: FoldState, event: Extract<WeaveEvent, { type: "task.finished" }>): void {
  const taskId = event.taskId;
  const open = taskId ? state.open.get(taskId) : undefined;
  if (!taskId || !open) return;
  state.open.delete(taskId);
  const kind = state.kinds.get(taskId) ?? kindOfPaths(undefined);
  const sizeUnits = state.sizes.get(taskId) ?? 1;
  state.attempts.push({ runId: state.runId, taskId, kind, sizeUnits, engineId: open.engineId, isOk: event.status === "ok", wallMs: event.wallMs, costMicroUsd: open.costMicroUsd, tokens: open.tokens });
}

function applyAttempt(state: FoldState, event: WeaveEvent): boolean {
  switch (event.type) {
    case "attempt.started":
      state.open.set(event.taskId, { engineId: event.engineId, costMicroUsd: 0n, tokens: 0 });
      return true;
    case "task.started":
      if (event.taskId) rememberFirst(state.sizes, event.taskId, sizeUnitsOf(event.prompt));
      return true;
    case "usage": {
      const open = event.taskId ? state.open.get(event.taskId) : undefined;
      if (!event.taskId || !open) return true;
      const cost = usdToMicro(event.costUsd ?? 0);
      state.open.set(event.taskId, { ...open, costMicroUsd: cost > open.costMicroUsd ? cost : open.costMicroUsd, tokens: Math.max(open.tokens, event.used) });
      return true;
    }
    case "task.finished":
      closeAttempt(state, event);
      return true;
    default:
      return false;
  }
}

function applyRun(state: FoldState, event: WeaveEvent): void {
  switch (event.type) {
    case "run.started":
      state.runId = event.runId;
      state.concurrency = concurrencyOf(event.config);
      return;
    case "orchestration.decided":
      for (const task of event.tasks) {
        state.kinds.set(task.taskId, task.kind);
        state.sizes.set(task.taskId, task.sizeUnits);
      }
      return;
    case "plan.created":
      for (const task of event.tasks) rememberFirst(state.kinds, task.id, kindOfPaths(task.allowedPaths));
      return;
    case "employee.assigned":
      if (event.employeeId) state.employees.set(event.taskId, event.employeeId);
      return;
    case "pool.task.settled": {
      const employeeId = state.employees.get(event.taskId);
      if (employeeId) state.employeeTasks.push({ employeeId, taskId: event.taskId, status: event.status, wallMs: event.wallMs });
      state.settled.push({ taskId: event.taskId, concurrency: state.concurrency, overheadMs: Math.max(0, event.wallMs - event.agentMs) });
      return;
    }
    case "merge.finished":
      state.merges += 1;
      if (event.status === "conflict") state.conflicts += 1;
      if (event.verifyMs !== undefined) state.verifyMs.push(event.verifyMs);
      return;
    case "verification.rung":
      state.pendingVerifyMs += event.wallMs;
      return;
    case "verification.finished":
      state.verifyMs.push(state.pendingVerifyMs);
      state.pendingVerifyMs = 0;
      return;
    default:
      return;
  }
}

export function foldRun(events: readonly WeaveEvent[]): RunHistory {
  const state: FoldState = {
    runId: events[0]?.runId ?? "", concurrency: 1, kinds: new Map(), sizes: new Map(), open: new Map(), attempts: [], settled: [],
    merges: 0, conflicts: 0, pendingVerifyMs: 0, verifyMs: [], employees: new Map(), employeeTasks: [],
  };
  for (const event of events) {
    if (!applyAttempt(state, event)) applyRun(state, event);
  }
  const { runId, concurrency, attempts, settled, merges, conflicts, verifyMs, employeeTasks } = state;
  return { runId, concurrency, attempts, settled, merges, conflicts, verifyMs, employeeTasks };
}
