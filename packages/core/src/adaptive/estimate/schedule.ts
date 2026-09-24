import type { GraphTask, Schedule, ScheduledInterval } from "./types.ts";

export function bottomLevels(tasks: readonly GraphTask[], durationOf: (taskId: string) => number): ReadonlyMap<string, number> {
  const dependents = new Map<string, string[]>();
  for (const task of tasks) {
    for (const dependency of task.dependencies ?? []) dependents.set(dependency.task, [...(dependents.get(dependency.task) ?? []), task.id]);
  }
  const levels = new Map<string, number>();
  const visit = (taskId: string, trail: ReadonlySet<string>): number => {
    const known = levels.get(taskId);
    if (known !== undefined) return known;
    if (trail.has(taskId)) return 0;
    const next = new Set([...trail, taskId]);
    const tail = Math.max(0, ...(dependents.get(taskId) ?? []).map((child) => visit(child, next)));
    const level = durationOf(taskId) + tail;
    levels.set(taskId, level);
    return level;
  };
  for (const task of tasks) visit(task.id, new Set());
  return levels;
}

export function criticalPathMs(tasks: readonly GraphTask[], durationOf: (taskId: string) => number): number {
  return Math.max(0, ...bottomLevels(tasks, durationOf).values());
}

function isReady(task: GraphTask, finished: ReadonlyMap<string, number>, now: number): boolean {
  return (task.dependencies ?? []).every((dependency) => (finished.get(dependency.task) ?? Infinity) <= now);
}

export type IsExclusive = (a: string, b: string) => boolean;

const NEVER_EXCLUSIVE: IsExclusive = () => false;

function exclusiveUntil(taskId: string, intervals: ReadonlyMap<string, ScheduledInterval>, isExclusive: IsExclusive): number {
  return Math.max(0, ...[...intervals.entries()].filter(([other]) => isExclusive(taskId, other)).map(([, interval]) => interval.endMs));
}

export function listSchedule(tasks: readonly GraphTask[], durationOf: (taskId: string) => number, workers: number, isExclusive: IsExclusive = NEVER_EXCLUSIVE): Schedule {
  const priority = bottomLevels(tasks, durationOf);
  const byPriority = [...tasks].sort((a, b) => (priority.get(b.id) ?? 0) - (priority.get(a.id) ?? 0) || a.id.localeCompare(b.id));
  const intervals = new Map<string, ScheduledInterval>();
  const finished = new Map<string, number>();
  const lanes: number[] = Array.from({ length: Math.max(1, workers) }, () => 0);
  for (let placed = 0; placed < tasks.length; placed += 1) {
    const laneFree = Math.min(...lanes);
    const lane = lanes.indexOf(laneFree);
    const candidates = byPriority.filter((task) => !intervals.has(task.id));
    const readyAt = (task: GraphTask): number => Math.max(laneFree, ...(task.dependencies ?? []).map((dependency) => finished.get(dependency.task) ?? Infinity));
    const next = candidates.find((task) => isReady(task, finished, laneFree)) ?? [...candidates].sort((a, b) => readyAt(a) - readyAt(b))[0];
    if (!next || !Number.isFinite(readyAt(next))) break;
    const startMs = Math.max(readyAt(next), exclusiveUntil(next.id, intervals, isExclusive));
    const endMs = startMs + durationOf(next.id);
    intervals.set(next.id, { startMs, endMs });
    finished.set(next.id, endMs);
    lanes[lane] = endMs;
  }
  return { makespanMs: Math.max(0, ...[...intervals.values()].map((interval) => interval.endMs)), intervals };
}
