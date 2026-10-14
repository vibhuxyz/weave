import type { TaskContract } from "@weave/protocol";
import { mayOverlap } from "../decide/index.ts";
import { graphIssues } from "./graph.ts";
import type { PlanIssue } from "./issue-types.ts";

const MAX_PLAN_ISSUES = 20;
const MAX_PATHS_PER_OVERLAP = 3;

export type { PlanIssue } from "./issue-types.ts";

type IssuedTask = Pick<TaskContract, "id" | "allowedPaths" | "dependencies">;

export function formatPlanIssue(issue: PlanIssue): string {
  switch (issue.kind) {
    case "cycle":
      return `cycle: ${issue.path.join(" → ")}`;
    case "path-overlap":
      return `${issue.tasks.join(" and ")} both own ${issue.paths.join(", ")}`;
    case "unknown-dependency":
      return `${issue.task} waits on unknown task ${issue.waitsOn}`;
    case "self-dependency":
      return `${issue.task} depends on itself`;
    case "duplicate-id":
      return `Duplicate task id ${issue.task}`;
    default: {
      const unreachable: never = issue;
      return unreachable;
    }
  }
}

function overlappingPaths(left: readonly string[], right: readonly string[]): readonly string[] {
  const paths: string[] = [];
  for (const pathA of left) {
    for (const pathB of right) {
      if (!mayOverlap(pathA, pathB) || paths.length >= MAX_PATHS_PER_OVERLAP) continue;
      paths.push(pathA === pathB ? pathA : `${pathA} and ${pathB}`);
    }
  }
  return paths;
}

export function overlapIssues(tasks: readonly IssuedTask[]): readonly PlanIssue[] {
  const issues: PlanIssue[] = [];
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    if (task === undefined) continue;
    for (const other of tasks.slice(index + 1)) {
      const paths = overlappingPaths(task.allowedPaths ?? [], other.allowedPaths ?? []);
      if (paths.length === 0) continue;
      issues.push({ kind: "path-overlap", tasks: [task.id, other.id], paths });
    }
  }
  return issues;
}

export function describedPlanIssues(tasks: readonly IssuedTask[]): readonly string[] {
  return [...graphIssues(tasks).map(formatPlanIssue), ...overlapIssues(tasks).map(formatPlanIssue)].slice(0, MAX_PLAN_ISSUES);
}
