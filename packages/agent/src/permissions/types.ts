import type {
  RequestPermissionRequest,
  TaskContract,
} from "@weave/protocol";

/** Who decided. A refusal the user never saw has to be shown to them. */
export type PermissionSource = "policy" | "user";

export type PermissionDecision =
  | { decision: "allow"; optionId: string; reason: string; source?: PermissionSource }
  | { decision: "reject"; reason: string; optionId?: string; source?: PermissionSource };

export type PermissionPolicy = (
  task: TaskContract,
  request: RequestPermissionRequest,
) => PermissionDecision | Promise<PermissionDecision>;

export type PermissionPrompter = (
  task: TaskContract,
  request: RequestPermissionRequest,
  command: string | null,
) => Promise<PermissionDecision>;

export interface CommandSafetyResult {
  allowed: boolean;
  reason?: string;
}
