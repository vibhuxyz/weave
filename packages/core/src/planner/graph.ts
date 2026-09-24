import type { TaskContract } from "@weave/protocol";

type GraphTask = Pick<TaskContract, "id" | "dependencies">;

function findCycle(tasks: readonly GraphTask[]): string[] | null {
  const dependenciesOf = new Map(
    tasks.map((task) => [task.id, (task.dependencies ?? []).map((dependency) => dependency.task)]),
  );
  const finished = new Set<string>();

  const visit = (id: string, trail: readonly string[]): string[] | null => {
    const at = trail.indexOf(id);
    if (at !== -1) return [...trail.slice(at), id];
    if (finished.has(id)) return null;
    for (const next of dependenciesOf.get(id) ?? []) {
      const cycle = visit(next, [...trail, id]);
      if (cycle) return cycle;
    }
    finished.add(id);
    return null;
  };

  for (const task of tasks) {
    const cycle = visit(task.id, []);
    if (cycle) return cycle;
  }
  return null;
}

export function validateGraph(tasks: readonly GraphTask[]): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const task of tasks) {
    if (ids.has(task.id)) issues.push(`Duplicate task id ${task.id}`);
    ids.add(task.id);
  }
  for (const task of tasks) {
    for (const dependency of task.dependencies ?? []) {
      if (dependency.task === task.id) issues.push(`Task ${task.id} depends on itself`);
      else if (!ids.has(dependency.task)) {
        issues.push(`Task ${task.id} depends on unknown task ${dependency.task}`);
      }
    }
  }
  if (issues.length > 0) return issues;

  const cycle = findCycle(tasks);
  return cycle ? [`Dependency cycle: ${cycle.join(" -> ")}`] : [];
}
