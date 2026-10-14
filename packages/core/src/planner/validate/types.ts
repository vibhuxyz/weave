import type { TaskContract, VerificationRung } from "@weave/protocol";

export type ReviewedTask = Pick<TaskContract, "id" | "allowedPaths" | "dependencies" | "employee" | "engine" | "produces" | "skills" | "subtasks" | "verify" | "verifyRung">;

export interface PlanAnchorFile {
  readonly file: string;
  readonly symbol: string;
}

export interface PlanValidationContext {
  readonly supportedRungs: readonly VerificationRung[] | null;
  readonly employeeIds: readonly string[] | null;
  readonly skillNames: readonly string[] | null;
  readonly engineIds: readonly string[] | null;
  readonly packageManager?: string | null;
  readonly anchorFiles?: readonly PlanAnchorFile[] | null;
}

export interface PlanReview {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}
