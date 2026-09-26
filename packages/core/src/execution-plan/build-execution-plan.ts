import { listSchedule, type ScheduledInterval } from "../adaptive/index.ts";
import type { ExecutionPlan, ExecutionPlanInput, ExecutionSlot } from "./types.ts";

const ORDER_ONLY_DURATION_MS = 1;

interface Placed {
  readonly taskId: string;
  readonly interval: ScheduledInterval;
}

function assignWorkers(placed: readonly Placed[], workers: number): ReadonlyMap<string, number> {
  const ordered = [...placed].sort((a, b) => a.interval.startMs - b.interval.startMs || a.taskId.localeCompare(b.taskId));
  const freeAt: number[] = Array.from({ length: Math.max(1, workers) }, () => 0);
  const workerOf = new Map<string, number>();
  for (const { taskId, interval } of ordered) {
    const free = freeAt.findIndex((endMs) => endMs <= interval.startMs);
    const lane = free === -1 ? freeAt.indexOf(Math.min(...freeAt)) : free;
    freeAt[lane] = interval.endMs;
    workerOf.set(taskId, lane + 1);
  }
  return workerOf;
}

function slotOf(input: ExecutionPlanInput, placed: Placed, worker: number, after: readonly string[]): ExecutionSlot {
  const [engineId, ...fallbackEngineIds] = input.enginesByTask.get(placed.taskId) ?? input.defaultEngines;
  return {
    taskId: placed.taskId,
    worker,
    employeeId: input.employeesByTask.get(placed.taskId) ?? null,
    engineId: engineId ?? null,
    fallbackEngineIds,
    after,
    startMs: placed.interval.startMs,
    endMs: placed.interval.endMs,
  };
}

export function buildExecutionPlan(input: ExecutionPlanInput): ExecutionPlan {
  const estimates = input.estimatedMsByTask;
  const durationOf = (taskId: string): number => estimates?.get(taskId) ?? ORDER_ONLY_DURATION_MS;
  const schedule = listSchedule(input.tasks, durationOf, input.workers);
  const placed = [...schedule.intervals.entries()].map(([taskId, interval]) => ({ taskId, interval }));
  const workerOf = assignWorkers(placed, input.workers);
  const afterByTask = new Map(input.tasks.map((task) => [task.id, (task.dependencies ?? []).map((dependency) => dependency.task)]));
  const slots = placed
    .map((entry) => slotOf(input, entry, workerOf.get(entry.taskId) ?? 1, afterByTask.get(entry.taskId) ?? []))
    .sort((a, b) => a.startMs - b.startMs || a.worker - b.worker);
  return {
    workers: input.workers,
    timing: estimates ? "estimated" : "order-only",
    estimatedMs: estimates ? schedule.makespanMs : null,
    estimatedCostMicroUsd: input.estimatedCostMicroUsd,
    slots,
  };
}
