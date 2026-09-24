import type { Reached } from "./types.ts";

export function reverseIndex(edges: readonly { readonly from: string; readonly to: string }[]): ReadonlyMap<string, readonly string[]> {
  const index = new Map<string, string[]>();
  for (const edge of edges) index.set(edge.to, [...(index.get(edge.to) ?? []), edge.from]);
  return index;
}

export function reachBackwards(starts: readonly string[], reverse: ReadonlyMap<string, readonly string[]>, maxDepth: number, maxItems: number): { readonly reached: readonly Reached[]; readonly isTruncated: boolean } {
  const seen = new Set(starts);
  const reached: Reached[] = [];
  let frontier = [...starts];
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const source of reverse.get(node) ?? []) {
        if (seen.has(source)) continue;
        if (reached.length >= maxItems) return { reached, isTruncated: true };
        seen.add(source);
        reached.push({ id: source, depth });
        next.push(source);
      }
    }
    frontier = next.sort();
  }
  return { reached, isTruncated: false };
}
