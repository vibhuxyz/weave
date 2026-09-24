export interface CappedList<T> {
  readonly items: readonly T[];
  readonly hidden: number;
}

export interface CodeLocation {
  readonly file: string;
  readonly line: number;
}

export interface ApiView extends CodeLocation {
  readonly method: string;
  readonly path: string;
}

export interface ChangeView {
  readonly sha: string;
  readonly at: string;
  readonly subject: string;
  readonly fileCount: number;
}

export interface WorkspaceView {
  readonly name: string;
  readonly dir: string;
  readonly kind: "application" | "package";
  readonly internalDependencies: readonly string[];
  readonly layers: readonly { readonly layer: string; readonly files: number }[];
}

export interface ProjectOverview {
  readonly revision: number;
  readonly repository: { readonly isGitRepo: boolean; readonly branch: string | null; readonly head: string | null };
  readonly stack: { readonly languages: readonly string[]; readonly frameworks: readonly string[]; readonly packageManager: string | null };
  readonly counts: { readonly files: number; readonly symbols: number; readonly imports: number; readonly calls: number; readonly apis: number; readonly events: number; readonly externalPackages: number };
  readonly workspaces: CappedList<WorkspaceView>;
  readonly recentChanges: CappedList<ChangeView>;
  readonly skipped: CappedList<{ readonly path: string; readonly reason: string }>;
}

export interface Reach {
  readonly id: string;
  readonly depth: number;
}

export interface ProjectQueryResult {
  readonly request: string;
  readonly terms: readonly string[];
  readonly application: { readonly name: string; readonly dir: string; readonly kind: string } | null;
  readonly files: CappedList<{ readonly path: string; readonly workspace: string | null; readonly reasons: readonly string[] }>;
  readonly symbols: CappedList<CodeLocation & { readonly name: string; readonly kind: string }>;
  readonly imports: CappedList<string>;
  readonly dependents: CappedList<string>;
  readonly callers: CappedList<string>;
  readonly callees: CappedList<string>;
  readonly apis: CappedList<ApiView>;
  readonly events: CappedList<CodeLocation & { readonly name: string; readonly role: "emit" | "listen" }>;
  readonly recentChanges: CappedList<ChangeView>;
  readonly tests: CappedList<string>;
  readonly commands: CappedList<{ readonly command: string; readonly cwd: string }>;
  readonly impact: {
    readonly seedFiles: readonly string[];
    readonly dependents: CappedList<Reach>;
    readonly callers: CappedList<Reach>;
    readonly apis: CappedList<ApiView>;
    readonly tests: CappedList<string>;
    readonly workspaces: readonly string[];
    readonly isTruncated: boolean;
  };
}

export type ProjectClientMessage =
  | { readonly type: "read-project-overview" }
  | { readonly type: "query-project"; readonly queryId: string; readonly text: string };

export type ProjectServerMessage =
  | { readonly type: "project-overview"; readonly overview: ProjectOverview }
  | { readonly type: "project-overview-failed"; readonly message: string }
  | { readonly type: "project-query-result"; readonly queryId: string; readonly result: ProjectQueryResult }
  | { readonly type: "project-query-failed"; readonly queryId: string; readonly message: string };

export const PROJECT_CLIENT_MESSAGE_TYPES = ["read-project-overview", "query-project"] as const;
