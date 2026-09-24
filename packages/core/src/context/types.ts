export type FileKind = "source" | "test" | "manifest" | "config" | "doc" | "other";

export interface ProjectFile {
  readonly path: string;
  readonly bytes: number;
  readonly kind: FileKind;
  readonly workspace: string | null;
  readonly hash: string | null;
}

export interface Skipped {
  readonly path: string;
  readonly reason: string;
}

export type WorkspaceKind = "application" | "package";

export interface Workspace {
  readonly name: string;
  readonly dir: string;
  readonly kind: WorkspaceKind;
  readonly scripts: readonly string[];
  readonly internalDependencies: readonly string[];
  readonly entrypoints: readonly string[];
}

export interface Stack {
  readonly languages: readonly string[];
  readonly frameworks: readonly string[];
  readonly packageManager: string | null;
}

export type SymbolKind = "function" | "class" | "interface" | "type" | "enum" | "variable";

export interface SymbolFact {
  readonly id: string;
  readonly name: string;
  readonly kind: SymbolKind;
  readonly file: string;
  readonly line: number;
  readonly isExported: boolean;
  readonly hash: string;
}

export interface ImportBinding {
  readonly local: string;
  readonly imported: string;
}

export interface ImportFact {
  readonly specifier: string;
  readonly bindings: readonly ImportBinding[];
  readonly isTypeOnly: boolean;
}

export interface CallFact {
  readonly callee: string;
  readonly caller: string | null;
}

export interface InstanceFact {
  readonly local: string;
  readonly className: string;
}

export type ApiSource = "route" | "contract";

export interface ApiFact {
  readonly method: string;
  readonly path: string;
  readonly file: string;
  readonly line: number;
  readonly source: ApiSource;
  readonly handler: string | null;
}

export interface EventFact {
  readonly name: string;
  readonly role: "emit" | "listen";
  readonly file: string;
  readonly line: number;
}

export interface ModuleFacts {
  readonly path: string;
  readonly symbols: readonly SymbolFact[];
  readonly imports: readonly ImportFact[];
  readonly calls: readonly CallFact[];
  readonly instances: readonly InstanceFact[];
  readonly apis: readonly ApiFact[];
  readonly events: readonly EventFact[];
}

export interface DependencyEdge {
  readonly from: string;
  readonly to: string;
  readonly names: readonly string[];
}

export interface CallEdge {
  readonly from: string;
  readonly to: string;
}

export interface ExternalPackage {
  readonly name: string;
  readonly dependents: number;
}

export interface CommitSummary {
  readonly sha: string;
  readonly at: string;
  readonly subject: string;
  readonly files: readonly string[];
}

export type Layer = "api" | "service" | "data" | "ui" | "state" | "contract" | "test" | "config" | "other";

export interface WorkspaceArchitecture {
  readonly workspace: string;
  readonly layers: Readonly<Partial<Record<Layer, number>>>;
  readonly entrypoints: readonly string[];
}

export interface RepositoryInfo {
  readonly root: string;
  readonly isGitRepo: boolean;
  readonly branch: string | null;
  readonly head: string | null;
}

export interface ProjectModel {
  readonly version: 2;
  readonly revision: number;
  readonly repository: RepositoryInfo;
  readonly stack: Stack;
  readonly applications: readonly Workspace[];
  readonly packages: readonly Workspace[];
  readonly files: readonly ProjectFile[];
  readonly symbols: readonly SymbolFact[];
  readonly dependencies: {
    readonly internal: readonly DependencyEdge[];
    readonly external: readonly ExternalPackage[];
    readonly calls: readonly CallEdge[];
  };
  readonly apis: readonly ApiFact[];
  readonly events: readonly EventFact[];
  readonly rules: readonly string[];
  readonly recentChanges: readonly CommitSummary[];
  readonly architecture: readonly WorkspaceArchitecture[];
  readonly skipped: readonly Skipped[];
}
