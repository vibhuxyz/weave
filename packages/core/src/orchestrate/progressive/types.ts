export type OrchestrationPhase = "direct" | "planning" | "expanded" | "stayed";

export type Expansion =
  | { readonly ok: true }
  | { readonly ok: false; readonly reasons: readonly string[]; readonly canRepair: boolean };

export type AreaRole = "contract" | "module";

export interface WorkArea {
  readonly id: string;
  readonly dir: string;
  readonly role: AreaRole;
}

export interface Assessment {
  readonly decision: "stay" | "plan";
  readonly reason: string;
  readonly areas: readonly WorkArea[];
  readonly contractFirst: boolean;
}

export interface WorkspaceRef {
  readonly name: string;
  readonly dir: string;
}

export interface RankedPath {
  readonly path: string;
  readonly workspace: string | null;
}
