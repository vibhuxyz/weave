import type {
  BranchRef,
  Commit,
  DiffRange,
  FileStat,
  ServerMessage,
  SkippedFile,
} from "../../../server/index.ts";

export type { BranchRef, Commit, DiffRange, FileStat, SkippedFile };

export type DiffMessage = Extract<
  ServerMessage,
  {
    readonly type:
      | "diff-refs-result"
      | "diff-commits-result"
      | "diff-files-result"
      | "diff-patch-result"
      | "diff-context-result"
      | "diff-failed";
  }
>;

export type DiffSource =
  | { readonly kind: "turn"; readonly turnId: string }
  | { readonly kind: "working"; readonly base: string | null }
  | { readonly kind: "commit"; readonly sha: string }
  | { readonly kind: "range"; readonly from: string; readonly to: string }
  | { readonly kind: "file"; readonly path: string };

export type StatsState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly files: readonly FileStat[]; readonly skipped: readonly SkippedFile[] }
  | { readonly status: "error"; readonly message: string };

export interface RefsState {
  readonly branch: string | null;
  readonly defaultBranch: string | null;
  readonly branches: readonly BranchRef[];
}

export interface Expansion {
  readonly up: number;
  readonly down: number;
}
