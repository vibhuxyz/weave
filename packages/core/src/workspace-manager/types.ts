export interface RunBranch {
  readonly name: string;
  readonly previousBranch: string | null;
  readonly baseCommit: string;
}

export interface WorkspaceState {
  readonly root: string;
  readonly currentBranch: string | null;
  readonly runBranch: string | null;
  readonly baseCommit: string;
  readonly isClean: boolean;
}

export type Placement = "shared" | "isolated";

export interface TaskPlacement {
  readonly taskId: string;
  readonly placement: Placement;
  readonly conflicts: readonly string[];
}

export interface LockHandle {
  readonly owner: string;
  readonly paths: readonly string[];
  readonly release: () => void;
}

export interface ExternalChange {
  readonly path: string;
  readonly code: string;
}

export interface WatchOptions {
  readonly intervalMs: number;
  readonly isOurs: (path: string) => boolean;
  readonly onChange: (changes: readonly ExternalChange[]) => void;
}

export type OpenWorkspace =
  | { readonly ok: true; readonly state: WorkspaceState }
  | { readonly ok: false; readonly reason: string };
