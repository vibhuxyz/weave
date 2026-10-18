import type { PermissionPolicy, PromptImage } from "@weave/agent";
import type { RunConfig, WeaveEvent } from "@weave/protocol";
import type { Budgets, EngineCandidate, HistoryStats, OrchestrationDecision } from "../adaptive/index.ts";
import type { Assignment, EmployeeRegistry } from "../employees/index.ts";
import type { Contract } from "../contracts/index.ts";
import type { Decision } from "../decide/index.ts";
import type { VerifyWorkspace } from "../integrator/index.ts";
import type { ProjectModel } from "../context/index.ts";
import type { PlanIntent, PlannedTask, ProjectKind } from "../planner/index.ts";
import type { PoolSession, RunWorker } from "../pool/index.ts";
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
  readonly reviewTurn?: TurnRunner;
  readonly runWorker?: RunWorker;
  readonly verify?: VerifyWorkspace;
  readonly signal?: AbortSignal;
  readonly shouldInstall?: boolean;
  readonly maxWorkers?: number;
  readonly machineCapacity?: number;
  readonly onEvent?: (event: WeaveEvent) => void;
  readonly adaptive?: AdaptiveOptions;
  readonly employees?: EmployeesOptions;
  readonly approvePlan?: () => Promise<boolean>;
  readonly images?: readonly PromptImage[];
  readonly planningBudgetMs?: number;
  readonly presetTasks?: readonly PlannedTask[];
  readonly briefings?: ReadonlyMap<string, string>;
  readonly onPoolSession?: (session: PoolSession) => void;
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
  readonly model?: ProjectModel | null;
  readonly preflightWarnings?: readonly string[];
  readonly planningBudgetMs?: number;
  readonly employeeRoster?: string | null;
  readonly employeeIds?: readonly string[] | null;
  readonly engineCandidates: readonly EngineCandidate[];
  readonly repoRoot: string;
  readonly weaveDir: string;
  readonly kind: ProjectKind;
  readonly runTurn: TurnRunner;
  readonly reviewTurn?: TurnRunner;
  readonly signal?: AbortSignal;
  readonly notes?: string | null;
}

export type PlanningOutcome =
  | { readonly status: "refused"; readonly reason: string }
  | { readonly status: "no-change-needed"; readonly reason: string }
  | {
      readonly status: "planned";
      readonly tasks: readonly PlannedTask[];
      readonly intent: PlanIntent;
      readonly contract: Pick<Contract, "exports" | "entryPath"> | null;
      readonly baseRef: string | undefined;
    };
