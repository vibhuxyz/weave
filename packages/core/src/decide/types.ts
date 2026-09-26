import type { VerificationRung, WorkerLimit } from "@weave/protocol";
import type { PlannedTask, ProjectKind } from "../planner/index.ts";

export type DecisionReason =
  | "single-task"
  | "too-few-tasks"
  | "unverifiable-task"
  | "overlapping-paths"
  | "disjoint-paths"
  | "no-contract"
  | "single-component"
  | "components-with-contract"
  | "adaptive";

export interface Decision {
  mode: "sequential" | "parallel";
  reason: DecisionReason;
}

export interface DecideInput {
  kind: ProjectKind;
  tasks: readonly PlannedTask[];
  hasContract: boolean;
  rungs: readonly VerificationRung[];
}

export interface WorkerCapacity {
  readonly requested: number;
  readonly maxWorkers: number;
  readonly machineCapacity: number;
  readonly affordable: number | null;
}

export interface WorkerCount {
  readonly workers: number;
  readonly limitedBy: WorkerLimit;
  readonly reason: string;
}
