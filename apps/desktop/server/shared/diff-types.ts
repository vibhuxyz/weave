import type {
  BranchRef,
  Commit,
  DiffHunk,
  DiffLine,
  DiffLineKind,
  DiffRange,
  FileDiff,
  FileDiffStatus,
  FileStat,
  LineSegment,
  SkippedFile,
} from "../diff/index.ts";

export type {
  BranchRef,
  Commit,
  DiffHunk,
  DiffLine,
  DiffLineKind,
  DiffRange,
  FileDiff,
  FileDiffStatus,
  FileStat,
  LineSegment,
  SkippedFile,
};

export type DiffClientMessage =
  | { readonly type: "diff-refs"; readonly requestId: string }
  | { readonly type: "diff-commits"; readonly requestId: string; readonly limit: number; readonly base: string | null }
  | { readonly type: "diff-files"; readonly requestId: string; readonly range: DiffRange }
  | {
      readonly type: "diff-patch";
      readonly requestId: string;
      readonly range: DiffRange;
      readonly paths: readonly string[];
    }
  | {
      readonly type: "diff-context";
      readonly requestId: string;
      readonly path: string;
      readonly rev: string | null;
      readonly from: number;
      readonly to: number;
    };

export type DiffServerMessage =
  | {
      readonly type: "diff-refs-result";
      readonly requestId: string;
      readonly branch: string | null;
      readonly defaultBranch: string | null;
      readonly branches: readonly BranchRef[];
    }
  | { readonly type: "diff-commits-result"; readonly requestId: string; readonly commits: readonly Commit[] }
  | {
      readonly type: "diff-files-result";
      readonly requestId: string;
      readonly files: readonly FileStat[];
      readonly skipped: readonly SkippedFile[];
    }
  | {
      readonly type: "diff-patch-result";
      readonly requestId: string;
      readonly files: readonly FileDiff[];
      readonly skipped: readonly SkippedFile[];
    }
  | {
      readonly type: "diff-context-result";
      readonly requestId: string;
      readonly path: string;
      readonly from: number;
      readonly lines: readonly string[];
    }
  | { readonly type: "diff-failed"; readonly requestId: string; readonly message: string };

export const DIFF_CLIENT_MESSAGE_TYPES = [
  "diff-refs",
  "diff-commits",
  "diff-files",
  "diff-patch",
  "diff-context",
] as const;
