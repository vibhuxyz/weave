import { areaOf } from "./area-of.ts";
import type { WorkGroup } from "./types.ts";

export function groupsWaitedOn(groups: readonly WorkGroup[], imports: readonly { readonly from: string; readonly to: string }[], workspaceDirs: readonly string[]): readonly (readonly number[])[] {
  const groupOfArea = new Map(groups.flatMap((group, index) => group.areas.map((area): [string, number] => [area, index])));
  const areaCache = new Map<string, string>();
  const cachedArea = (path: string): string => {
    const known = areaCache.get(path);
    if (known !== undefined) return known;
    const area = areaOf(path, workspaceDirs);
    areaCache.set(path, area);
    return area;
  };
  const waits = groups.map(() => new Set<number>());
  for (const edge of imports) {
    const importer = groupOfArea.get(cachedArea(edge.from));
    const imported = groupOfArea.get(cachedArea(edge.to));
    if (importer === undefined || imported === undefined || imported >= importer) continue;
    waits[importer]?.add(imported);
  }
  return waits.map((waited) => [...waited].sort((a, b) => a - b));
}
