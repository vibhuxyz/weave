import type { ToolDiff } from "@/features/chat/hooks";

export type DiffLineKind = "context" | "add" | "del";

export interface DiffLine {
  kind: DiffLineKind;
  /** 1-based line number in the pre-edit file, when the line exists there. */
  oldLine?: number;
  /** 1-based line number in the post-edit file, when the line exists there. */
  newLine?: number;
  text: string;
}

export interface DiffHunk {
  lines: DiffLine[];
  /** Unmodified lines skipped between the previous hunk and this one. */
  skippedBefore?: number;
}

export type FileDiffStatus = "added" | "modified" | "deleted";

export interface FileDiff {
  path: string;
  status: FileDiffStatus;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  /** True when the file was too large to line-diff and is shown whole-sale. */
  truncated: boolean;
}

export interface TurnDiff {
  files: FileDiff[];
  additions: number;
  deletions: number;
}

export interface DiffSegment {
  offset: number;
  first: ToolDiff;
  last: ToolDiff;
}
