import type { ReviewedTask } from "./types.ts";

const GLOB_CHARS = /[*?[\]{}!]/;

function staticPrefix(glob: string): readonly string[] {
  const segments = glob.split("/").filter((segment) => segment !== "" && segment !== ".");
  const firstGlob = segments.findIndex((segment) => GLOB_CHARS.test(segment));
  return firstGlob === -1 ? segments : segments.slice(0, firstGlob);
}

function mayOverlap(a: string, b: string): boolean {
  const [shorter, longer] = [staticPrefix(a), staticPrefix(b)].sort((x, y) => x.length - y.length);
  return (shorter ?? []).every((segment, index) => longer?.[index] === segment);
}

function upstreamOf(tasks: readonly ReviewedTask[]): ReadonlyMap<string, ReadonlySet<string>> {
  const direct = new Map(tasks.map((task) => [task.id, (task.dependencies ?? []).map((dependency) => dependency.task)]));
  const upstream = new Map<string, ReadonlySet<string>>();
  const collect = (id: string, visiting: ReadonlySet<string>): ReadonlySet<string> => {
    const known = upstream.get(id);
    if (known) return known;
    const parents = (direct.get(id) ?? []).filter((parent) => !visiting.has(parent));
    const all = new Set(parents.flatMap((parent) => [parent, ...collect(parent, new Set([...visiting, id]))]));
    upstream.set(id, all);
    return all;
  };
  for (const task of tasks) collect(task.id, new Set());
  return upstream;
}

function sharedWrite(a: ReviewedTask, b: ReviewedTask): string | null {
  for (const pathA of a.allowedPaths ?? []) {
    const pathB = (b.allowedPaths ?? []).find((candidate) => mayOverlap(pathA, candidate));
    if (pathB !== undefined) return pathA === pathB ? pathA : `${pathA} and ${pathB}`;
  }
  return null;
}

export function concurrentWriteConflicts(tasks: readonly ReviewedTask[]): readonly string[] {
  const upstream = upstreamOf(tasks);
  const isOrdered = (a: ReviewedTask, b: ReviewedTask) => Boolean(upstream.get(a.id)?.has(b.id) || upstream.get(b.id)?.has(a.id));
  return tasks.flatMap((task, index) => tasks.slice(index + 1).flatMap((other) => {
    const shared = isOrdered(task, other) ? null : sharedWrite(task, other);
    return shared === null ? [] : [`Tasks ${task.id} and ${other.id} can run at the same time but both write ${shared}; make one depend on the other or give them separate allowedPaths`];
  }));
}
