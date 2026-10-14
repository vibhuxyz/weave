import type { TaskContract } from "@weave/protocol";
import type { PlanIssue } from "./issue-types.ts";

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

export function graphIssues(tasks: readonly GraphTask[]): readonly PlanIssue[] {
  const issues: PlanIssue[] = [];
  const ids = new Set<string>();
  for (const task of tasks) {
    if (ids.has(task.id)) issues.push({ kind: "duplicate-id", task: task.id });
    ids.add(task.id);
  }
  for (const task of tasks) {
    for (const dependency of task.dependencies ?? []) {
      if (dependency.task === task.id) issues.push({ kind: "self-dependency", task: task.id });
      else if (!ids.has(dependency.task)) issues.push({ kind: "unknown-dependency", task: task.id, waitsOn: dependency.task });
    }
  }
  const cycle = findCycle(tasks);
  if (cycle) issues.push({ kind: "cycle", path: cycle });
  return issues;
}

function legacyGraphIssue(issue: PlanIssue): string {
  switch (issue.kind) {
    case "cycle":
      return `Dependency cycle: ${issue.path.join(" -> ")}`;
    case "unknown-dependency":
      return `Task ${issue.task} depends on unknown task ${issue.waitsOn}`;
    case "self-dependency":
      return `Task ${issue.task} depends on itself`;
    case "duplicate-id":
      return `Duplicate task id ${issue.task}`;
    case "path-overlap":
      return `${issue.tasks.join(" and ")} both own ${issue.paths.join(", ")}`;
    default: {
      const unreachable: never = issue;
      return unreachable;
    }
  }
}

export function validateGraph(tasks: readonly GraphTask[]): string[] {
  return graphIssues(tasks).map(legacyGraphIssue);
}
