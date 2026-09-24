import type { PermissionPolicy } from "@weave/agent";
import type { RunConfig, WeaveEvent } from "@weave/protocol";
import type { Budgets, HistoryStats, OrchestrationDecision } from "../adaptive/index.ts";
import type { Assignment, EmployeeRegistry } from "../employees/index.ts";
import type { Contract } from "../contracts/index.ts";
import type { Decision } from "../decide/index.ts";
import type { VerifyWorkspace } from "../integrator/index.ts";
import type { PlannedTask, ProjectKind } from "../planner/index.ts";
import type { RunWorker } from "../pool/index.ts";
import type { RunPlanReport } from "../run-plan/index.ts";

export type TurnRunner = (prompt: string, signal?: AbortSignal) => Promise<string>;

export interface AdaptiveOptions {
  readonly budgets?: Budgets;
  readonly stats?: HistoryStats;
  readonly msPerMicroUsd?: number;
}

export interface EmployeesOptions {
  readonly registry?: EmployeeRegistry;
  readonly userDir?: string | null;
}

export interface PlanAndRunOptions {
  readonly request: string;
  readonly repoRoot: string;
  readonly kind?: ProjectKind;
  readonly config?: RunConfig;
  readonly policy?: PermissionPolicy;
  readonly runTurn?: TurnRunner;
  readonly runWorker?: RunWorker;
  readonly verify?: VerifyWorkspace;
  readonly signal?: AbortSignal;
  readonly shouldInstall?: boolean;
  readonly maxWorkers?: number;
  readonly onEvent?: (event: WeaveEvent) => void;
  readonly adaptive?: AdaptiveOptions;
  readonly employees?: EmployeesOptions;
}

export type PlanAndRunResult =
  | { readonly status: "refused"; readonly reason: string }
  | { readonly status: "no-change-needed"; readonly reason: string }
  | {
      readonly status: "ran";
      readonly kind: ProjectKind;
      readonly decision: Decision;
      readonly tasks: readonly PlannedTask[];
      readonly report: RunPlanReport;
      readonly orchestration: OrchestrationDecision | null;
      readonly assignments: readonly Assignment[];
    };

export interface PlanningInput {
  readonly request: string;
  readonly projectContext?: string | null;
  readonly employeeRoster?: string | null;
  readonly repoRoot: string;
  readonly weaveDir: string;
  readonly kind: ProjectKind;
  readonly runTurn: TurnRunner;
  readonly signal?: AbortSignal;
}

export type PlanningOutcome =
  | { readonly status: "refused"; readonly reason: string }
  | { readonly status: "no-change-needed"; readonly reason: string }
  | {
      readonly status: "planned";
      readonly tasks: readonly PlannedTask[];
      readonly contract: Pick<Contract, "exports" | "entryPath"> | null;
      readonly baseRef: string | undefined;
    };
