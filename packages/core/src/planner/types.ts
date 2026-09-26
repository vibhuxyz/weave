import type { TaskContract, VerificationRung } from "@weave/protocol";
import type { REQUEST_RISKS, REQUEST_SCOPES, REQUEST_TYPES } from "./constants.ts";
import type { Critique, ReviewTurn } from "./review/index.ts";

export type ProjectKind = "existing" | "greenfield";

export interface PlannedTask extends TaskContract {
  title: string;
  component?: string;
  contractSymbols?: string[];
}

export interface PlanIntent {
  readonly goal: string | null;
  readonly assumptions: readonly string[];
  readonly risks: readonly string[];
}

export type RequestType = (typeof REQUEST_TYPES)[number];
export type RequestScope = (typeof REQUEST_SCOPES)[number];
export type RequestRisk = (typeof REQUEST_RISKS)[number];

export interface PlanClassification {
  readonly taskType: RequestType;
  readonly scope: RequestScope;
  readonly risk: RequestRisk;
  readonly domains: readonly string[];
}

export type Plan =
  | { status: "ready"; tasks: PlannedTask[]; classification: PlanClassification | null; intent: PlanIntent }
  | { status: "no-change-needed"; reason: string };

export type ParsePlanResult =
  | { ok: true; plan: Plan }
  | { ok: false; issues: string[] };

export interface PlannerPromptInput {
  request: string;
  kind: ProjectKind;
  rungs: readonly VerificationRung[];
  blueprint: string | null;
  contract: string | null;
  projectContext?: string | null;
  employees?: string | null;
  skillCatalog?: string | null;
  engineCatalog?: string | null;
}

export interface PlanRequest extends PlannerPromptInput {
  cwd: string;
  employeeIds?: readonly string[] | null;
  skillNames?: readonly string[] | null;
  engineIds?: readonly string[] | null;
  reviewTurn?: ReviewTurn;
  runTurn: (prompt: string, signal?: AbortSignal) => Promise<string>;
  signal?: AbortSignal;
}

export type PlanOutcome =
  | { ok: true; plan: Plan; attempts: number; warnings: readonly string[]; critique: Critique | null }
  | { ok: false; issues: readonly string[]; attempts: number };
