import type { TaskContract, VerificationRung } from "@weave/protocol";

export type ProjectKind = "existing" | "greenfield";

export interface PlannedTask extends TaskContract {
  title: string;
  component?: string;
  contractSymbols?: string[];
}

export type Plan =
  | { status: "ready"; tasks: PlannedTask[] }
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
}

export interface PlanRequest extends PlannerPromptInput {
  cwd: string;
  runTurn: (prompt: string, signal?: AbortSignal) => Promise<string>;
  signal?: AbortSignal;
}

export type PlanOutcome =
  | { ok: true; plan: Plan; attempts: number }
  | { ok: false; issues: string[]; attempts: number };
