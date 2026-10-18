export type DiffLineKind = "context" | "add" | "del";

export interface LineSegment {
  readonly text: string;
  readonly changed: boolean;
}

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly oldLine?: number;
  readonly newLine?: number;
  readonly text: string;
  readonly segments?: readonly LineSegment[];
}

export interface DiffHunk {
  readonly lines: readonly DiffLine[];
  readonly oldStart: number;
  readonly newStart: number;
  readonly skippedBefore?: number;
}

export type FileDiffStatus = "added" | "modified" | "deleted" | "renamed";

export interface FileDiff {
  readonly path: string;
  readonly dir: string;
  readonly name: string;
  readonly oldPath?: string;
  readonly status: FileDiffStatus;
  readonly additions: number;
  readonly deletions: number;
  readonly hunks: readonly DiffHunk[];
  readonly truncated: boolean;
}

export interface FileStat {
  readonly path: string;
  readonly dir: string;
  readonly name: string;
  readonly oldPath?: string;
  readonly status: FileDiffStatus;
  readonly additions: number;
  readonly deletions: number;
}

export interface SkippedFile {
  readonly path: string;
  readonly reason: string;
}

export type DiffRange =
  | { readonly kind: "working" }
  | { readonly kind: "branch"; readonly base: string }
  | { readonly kind: "commit"; readonly sha: string }
  | { readonly kind: "range"; readonly from: string; readonly to: string };

export interface Commit {
  readonly sha: string;
  readonly shortSha: string;
  readonly subject: string;
  readonly author: string;
  readonly committedAt: string;
}

export interface BranchRef {
  readonly name: string;
  readonly isCurrent: boolean;
}

export interface RefsPayload {
  readonly branch: string | null;
  readonly defaultBranch: string | null;
  readonly branches: readonly BranchRef[];
}

export interface StatsPayload {
  readonly files: readonly FileStat[];
  readonly skipped: readonly SkippedFile[];
}

export interface PatchPayload {
  readonly files: readonly FileDiff[];
  readonly skipped: readonly SkippedFile[];
}

export type DiffResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };
