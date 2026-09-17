import type { ToolEntry } from "@/features/chat/hooks";
import type { DiffSegment } from "./types";

export function groupToolDiffs(tools: ToolEntry[]): Map<string, DiffSegment[]> {
  const byPath = new Map<string, Map<number, DiffSegment>>();
  for (const tool of tools) {
    for (const diff of tool.diffs ?? []) {
      const offset = diff.startLine && diff.startLine > 0 ? diff.startLine - 1 : 0;
      let segments = byPath.get(diff.path);
      if (!segments) {
        segments = new Map();
        byPath.set(diff.path, segments);
      }
      const seen = segments.get(offset);
      if (seen) seen.last = diff;
      else segments.set(offset, { offset, first: diff, last: diff });
    }
  }

  return new Map(
    [...byPath].map(([path, segments]) => [
      path,
      [...segments.values()].sort((a, b) => a.offset - b.offset),
    ]),
  );
}
