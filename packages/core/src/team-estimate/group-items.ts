import { areaOf } from "./area-of.ts";
import type { WorkGroup, WorkItem } from "./types.ts";

function rootOf(parents: readonly number[], index: number): number {
  let current = index;
  for (let step = 0; step < parents.length; step += 1) {
    const parent = parents[current];
    if (parent === undefined || parent === current) return current;
    current = parent;
  }
  return current;
}

function linkItemsByArea(itemAreas: readonly (readonly string[])[]): number[] {
  const parents = itemAreas.map((_, index) => index);
  const firstItemOf = new Map<string, number>();
  itemAreas.forEach((areas, index) => {
    for (const area of areas) {
      const first = firstItemOf.get(area);
      if (first === undefined) firstItemOf.set(area, index);
      else parents[rootOf(parents, index)] = rootOf(parents, first);
    }
  });
  return parents;
}

export function groupItems(items: readonly WorkItem[], workspaceDirs: readonly string[]): readonly WorkGroup[] {
  const itemAreas = items.map((item) => [...new Set(item.paths.map((path) => areaOf(path, workspaceDirs)))].sort());
  const parents = linkItemsByArea(itemAreas);
  const members = new Map<number, number[]>();
  items.forEach((_, index) => {
    const root = rootOf(parents, index);
    members.set(root, [...(members.get(root) ?? []), index]);
  });
  return [...members.values()]
    .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))
    .map((indexes) => ({
      areas: [...new Set(indexes.flatMap((index) => itemAreas[index] ?? []))].sort(),
      items: indexes.flatMap((index) => items[index] ?? []),
    }));
}
