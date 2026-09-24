export interface EmployeeMemoryView {
  readonly enabled: boolean;
  readonly entries: number;
  readonly recent: readonly { readonly kind: string; readonly taskId: string; readonly at: string; readonly text: string }[];
}

export interface EmployeeView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: "builtin" | "user" | "project";
  readonly sourcePath: string | null;
  readonly responsibilities: readonly string[];
  readonly skills: readonly string[];
  readonly rules: readonly string[];
  readonly instructions: string;
  readonly permissions: {
    readonly read: readonly string[];
    readonly write: readonly string[];
    readonly deployment: boolean;
    readonly network: boolean;
    readonly gitCommit: boolean;
  };
  readonly capabilities: readonly string[];
  readonly engines: { readonly preferred: readonly string[]; readonly allowed: readonly string[] | null };
  readonly verification: { readonly required: readonly string[]; readonly preferred: readonly string[] };
  readonly memory: EmployeeMemoryView;
  readonly performance: { readonly tasks: number; readonly ok: number } | null;
  readonly brief: string;
}

export interface EmployeeDraft {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly responsibilities?: readonly string[];
  readonly skills?: readonly string[];
  readonly rules?: readonly string[];
  readonly instructions?: string;
  readonly permissions?: {
    readonly filesystem?: { readonly read?: readonly string[]; readonly write?: readonly string[] };
    readonly deployment?: { readonly allowed?: boolean };
    readonly network?: { readonly allowed?: boolean };
    readonly git?: { readonly commit?: boolean };
  };
  readonly capabilities?: readonly string[];
  readonly engines?: { readonly preferred?: readonly string[]; readonly allowed?: readonly string[] };
  readonly verification?: { readonly required?: readonly string[]; readonly preferred?: readonly string[] };
}

export interface SkillView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly source: "builtin" | "project";
  readonly sourcePath: string | null;
  readonly appliesWhen: readonly string[];
  readonly usedBy: readonly string[];
}

export interface ProjectQueryView {
  readonly request: string;
  readonly application: string | null;
  readonly files: readonly { readonly path: string; readonly reasons: readonly string[] }[];
  readonly symbols: readonly string[];
  readonly apis: readonly string[];
  readonly dependents: readonly string[];
  readonly callers: readonly string[];
  readonly tests: readonly string[];
  readonly commands: readonly string[];
  readonly recentChanges: readonly string[];
  readonly impactedWorkspaces: readonly string[];
}

export interface ProjectModelView {
  readonly revision: number;
  readonly branch: string | null;
  readonly counts: { readonly files: number; readonly symbols: number; readonly apis: number; readonly events: number; readonly imports: number };
  readonly stack: { readonly languages: readonly string[]; readonly frameworks: readonly string[]; readonly packageManager: string | null };
  readonly workspaces: readonly { readonly name: string; readonly dir: string; readonly kind: "application" | "package"; readonly layers: Readonly<Record<string, number>> }[];
  readonly apis: readonly string[];
  readonly buildMs: number;
  readonly query: ProjectQueryView | null;
}

export interface RunOptions {
  readonly adaptive: boolean;
  readonly employees: boolean;
  readonly budgets: {
    readonly runMaxCostUsd: string | null;
    readonly runMaxMinutes: number | null;
    readonly taskMaxCostUsd: string | null;
  };
}
