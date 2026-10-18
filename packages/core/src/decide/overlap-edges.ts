import type { TaskDependency } from "@weave/protocol";
import type { PlannedTask } from "../planner/index.ts";
import { tasksMayOverlap } from "./overlap.ts";

type Edges = ReadonlyMap<string, ReadonlySet<string>>;

function hasUnknownScope(task: PlannedTask): boolean {
  return (task.allowedPaths ?? []).length === 0;
}

function mustSerialize(a: PlannedTask, b: PlannedTask): boolean {
  if (hasUnknownScope(a) || hasUnknownScope(b)) return true;
  return tasksMayOverlap(a, b);
}

function declaredEdges(tasks: readonly PlannedTask[]): Map<string, Set<string>> {
  return new Map(tasks.map((task) => [task.id, new Set((task.dependencies ?? []).map((dependency) => dependency.task))]));
}

function reaches(edges: Edges, from: string, to: string): boolean {
  const seen = new Set<string>();
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined || seen.has(current)) continue;
    if (current === to) return true;
    seen.add(current);
    queue.push(...(edges.get(current) ?? []));
  }
  return false;
}

export function overlapEdges(tasks: readonly PlannedTask[]): ReadonlyMap<string, readonly TaskDependency[]> {
  const edges = declaredEdges(tasks);
  const added = new Map<string, TaskDependency[]>();
  for (const [index, earlier] of tasks.entries()) {
    for (const later of tasks.slice(index + 1)) {
      if (!mustSerialize(earlier, later)) continue;
      if (reaches(edges, later.id, earlier.id) || reaches(edges, earlier.id, later.id)) continue;
      edges.get(later.id)?.add(earlier.id);
      const forTask = added.get(later.id) ?? [];
      forTask.push({ task: earlier.id, requiredOutputs: [] });
      added.set(later.id, forTask);
    }
  }
  return added;
}

export function withOverlapEdges(tasks: readonly PlannedTask[]): readonly PlannedTask[] {
  const added = overlapEdges(tasks);
  return tasks.map((task) => {
    const extra = added.get(task.id);
    if (extra === undefined) return task;
    return { ...task, dependencies: [...(task.dependencies ?? []), ...extra] };
  });
}
