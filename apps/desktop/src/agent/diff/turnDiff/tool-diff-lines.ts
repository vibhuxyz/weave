import type { ToolDiff } from "@/features/chat/hooks";
import { diffLines, splitLines } from "./lineDiff";
import type { DiffLine } from "./types";

export function toolDiffLines(diff: ToolDiff): { readonly lines: readonly DiffLine[]; readonly truncated: boolean } {
  const offset = (diff.startLine ?? 1) - 1;
  return diffLines(splitLines(diff.oldText ?? ""), splitLines(diff.newText), offset);
}
