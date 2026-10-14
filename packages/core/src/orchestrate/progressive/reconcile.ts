import type { TaskDependency } from "@weave/protocol";
import { mayOverlap } from "../../decide/index.ts";
import { MAX_PATHS_PER_TASK, MAX_PRODUCED_OUTPUTS } from "../../planner/constants.ts";
import type { PlannedTask } from "../../planner/index.ts";
import { DIRECT_TASK_ID } from "./constants.ts";

export type Reconciliation =
  | { readonly ok: true; readonly direct: PlannedTask; readonly added: readonly PlannedTask[] }
  | { readonly ok: false; readonly reason: string };

function pathsOf(task: PlannedTask): readonly string[] {
  return task.allowedPaths ?? [];
}

function overlaps(left: readonly string[], right: readonly string[]): boolean {
  return left.some((path) => right.some((other) => mayOverlap(path, other)));
}

function touchedScore(task: PlannedTask, touched: readonly string[]): number {
  return pathsOf(task).filter((path) => touched.some((file) => mayOverlap(path, file))).length;
}

function pickAssigned(tasks: readonly PlannedTask[], touched: readonly string[]): PlannedTask | null {
  const ranked = [...tasks].sort((left, right) => touchedScore(right, touched) - touchedScore(left, touched) || left.id.localeCompare(right.id));
  const closest = ranked[0];
  if (touched.length > 0 && closest && touchedScore(closest, touched) > 0) return closest;
  return tasks.find((task) => task.id === DIRECT_TASK_ID)
    ?? tasks.find((task) => (task.dependencies ?? []).length === 0 && (task.produces ?? []).length > 0)
    ?? closest
    ?? null;
}

function absorbedIds(tasks: readonly PlannedTask[], assigned: PlannedTask, touched: readonly string[]): ReadonlySet<string> {
  const ids = new Set<string>([assigned.id]);
  for (const task of tasks) {
    if (overlaps(pathsOf(task), touched) || overlaps(pathsOf(task), pathsOf(assigned))) ids.add(task.id);
  }
  return ids;
}

function pointAtDirect(dependency: TaskDependency, absorbed: ReadonlySet<string>): TaskDependency {
  return absorbed.has(dependency.task) ? { ...dependency, task: DIRECT_TASK_ID } : dependency;
}

function union(values: readonly (readonly string[] | undefined)[], max: number): string[] | undefined {
  const unique = [...new Set(values.flatMap((entry) => [...(entry ?? [])]))].sort();
  return unique.length === 0 ? undefined : unique.slice(0, max);
}

function withoutSelf(dependencies: readonly TaskDependency[] | undefined, taskId: string): TaskDependency[] | undefined {
  const kept = (dependencies ?? []).filter((dependency) => dependency.task !== taskId);
  return kept.length === 0 ? undefined : kept;
}

function addedTask(task: PlannedTask, absorbed: ReadonlySet<string>): PlannedTask {
  const dependencies = withoutSelf((task.dependencies ?? []).map((dependency) => pointAtDirect(dependency, absorbed)), task.id);
  return dependencies ? { ...task, dependencies } : { ...task, dependencies: undefined };
}

function assignedTask(running: PlannedTask, assigned: PlannedTask, absorbed: readonly PlannedTask[], ids: ReadonlySet<string>): PlannedTask {
  const allowedPaths = union(absorbed.map(pathsOf), MAX_PATHS_PER_TASK);
  const produces = union(absorbed.map((task) => task.produces), MAX_PRODUCED_OUTPUTS);
  const dependencies = withoutSelf((assigned.dependencies ?? []).map((dependency) => pointAtDirect(dependency, ids)), DIRECT_TASK_ID);
  return {
    ...running,
    title: assigned.title,
    prompt: absorbed.length === 1 ? assigned.prompt : running.prompt,
    ...(allowedPaths ? { allowedPaths } : {}),
    ...(produces ? { produces } : {}),
    ...(dependencies ? { dependencies } : {}),
    ...(assigned.verify ? { verify: assigned.verify } : {}),
    ...(assigned.verifyRung ? { verifyRung: assigned.verifyRung } : {}),
    ...(assigned.subtasks ? { subtasks: [...assigned.subtasks] } : {}),
    ...(assigned.employee ? { employee: assigned.employee } : {}),
    ...(assigned.engine ? { engine: assigned.engine } : {}),
    ...(assigned.complexity ? { complexity: assigned.complexity } : {}),
    ...(assigned.readOnlyPaths ? { readOnlyPaths: [...assigned.readOnlyPaths] } : {}),
  };
}

export function reconcilePlan(running: PlannedTask, tasks: readonly PlannedTask[], touched: readonly string[]): Reconciliation {
  if (tasks.length < 2) return { ok: false, reason: "the plan does not split the work" };
  const assigned = pickAssigned(tasks, touched);
  if (!assigned) return { ok: false, reason: "the plan does not split the work" };
  const ids = absorbedIds(tasks, assigned, touched);
  const absorbed = tasks.filter((task) => ids.has(task.id));
  const added = tasks.filter((task) => !ids.has(task.id) && task.id !== DIRECT_TASK_ID).map((task) => addedTask(task, ids));
  if (added.length === 0) return { ok: false, reason: "the running worker already covers the remaining work" };
  if (added.some((task) => task.id === running.id)) return { ok: false, reason: "the plan reuses the running worker id" };
  return { ok: true, direct: assignedTask(running, assigned, absorbed, ids), added };
}
