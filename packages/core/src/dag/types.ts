import type { TaskContract } from "@weave/protocol";
import type { ScheduledState } from "../scheduler/index.ts";

export const TASK_PHASES = [
  "pending",
  "ready",
  "running",
  "partially-blocked",
  "verifying",
  "completed",
  "failed",
] as const;

export type TaskPhase = (typeof TASK_PHASES)[number];

export type DagTask = Pick<TaskContract, "id" | "dependencies" | "produces">;

export interface TaskPhaseView {
  readonly taskId: string;
  readonly phase: TaskPhase;
  readonly waitingFor: readonly string[];
  readonly blockedBy: readonly string[];
}

export interface PhaseInput {
  readonly tasks: readonly DagTask[];
  readonly states: ReadonlyMap<string, ScheduledState>;
  readonly readyOutputs: ReadonlySet<string>;
  readonly verifying?: ReadonlySet<string>;
}

export type DagIssueKind =
  | "duplicate-task"
  | "unknown-dependency"
  | "self-dependency"
  | "cycle"
  | "undeclared-output";

export interface DagIssue {
  readonly kind: DagIssueKind;
  readonly message: string;
}

export type DagValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly DagIssue[] };
