import type { ToolDiff } from "@/features/chat/hooks";
import type {
  DiffHunk,
  DiffLine,
  DiffLineKind,
  FileDiff,
  FileDiffStatus,
  LineSegment,
} from "../../../../server/shared/index.ts";

export type { DiffHunk, DiffLine, DiffLineKind, FileDiff, FileDiffStatus, LineSegment };

export interface TurnDiff {
  readonly files: readonly FileDiff[];
  readonly additions: number;
  readonly deletions: number;
}

export interface DiffSegment {
  readonly offset: number;
  readonly first: ToolDiff;
  last: ToolDiff;
}
