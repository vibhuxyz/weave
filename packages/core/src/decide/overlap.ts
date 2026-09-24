import type { PlannedTask } from "../planner/index.ts";

const GLOB_CHARS = /[*?[\]{}!]/;

function staticPrefix(glob: string): string[] {
  const segments = glob.split("/").filter((segment) => segment !== "" && segment !== ".");
  const firstGlob = segments.findIndex((segment) => GLOB_CHARS.test(segment));
  return firstGlob === -1 ? segments : segments.slice(0, firstGlob);
}

function isPrefixOf(shorter: readonly string[], longer: readonly string[]): boolean {
  return shorter.every((segment, index) => longer[index] === segment);
}

export function mayOverlap(a: string, b: string): boolean {
  const prefixA = staticPrefix(a);
  const prefixB = staticPrefix(b);
  return prefixA.length <= prefixB.length ? isPrefixOf(prefixA, prefixB) : isPrefixOf(prefixB, prefixA);
}

function tasksMayOverlap(a: PlannedTask, b: PlannedTask): boolean {
  const pathsB = b.allowedPaths ?? [];
  return (a.allowedPaths ?? []).some((pathA) => pathsB.some((pathB) => mayOverlap(pathA, pathB)));
}

export function hasPairwiseDisjointPaths(tasks: readonly PlannedTask[]): boolean {
  return tasks.every((task, index) =>
    tasks.slice(index + 1).every((other) => !tasksMayOverlap(task, other)),
  );
}
