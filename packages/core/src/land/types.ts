export interface LandOptions {
  readonly repoRoot: string;
  readonly runBranch: string;
  readonly integrationRef: string;
  readonly checkout?: boolean;
}

export interface LandSummary {
  readonly branch: string;
  readonly head: string;
  readonly previousHead: string | null;
  readonly checkedOut: boolean;
  readonly changedFiles: readonly string[];
}

export type LandResult =
  | { readonly ok: true; readonly landed: LandSummary }
  | { readonly ok: false; readonly reason: string };

export interface CommitProjectOptions {
  readonly repoRoot: string;
  readonly runBranch: string;
  readonly message: string;
}

export interface ProjectCommit {
  readonly branch: string;
  readonly commit: string | null;
  readonly changedFiles: readonly string[];
}

export type CommitProjectResult =
  | { readonly ok: true; readonly committed: ProjectCommit }
  | { readonly ok: false; readonly reason: string };
