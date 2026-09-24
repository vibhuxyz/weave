import type { VerificationRung } from "@weave/protocol";
import type { PlannedTask, ProjectKind } from "../planner/index.ts";

export type DecisionReason =
  | "single-task"
  | "too-few-tasks"
  | "unverifiable-task"
  | "overlapping-paths"
  | "disjoint-paths"
  | "no-contract"
  | "single-component"
  | "components-with-contract";

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
