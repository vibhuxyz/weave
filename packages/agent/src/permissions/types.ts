import type {
  RequestPermissionRequest,
  TaskContract,
} from "@weave/protocol";

export type PermissionDecision =
  | { decision: "allow"; optionId: string; reason: string }
  | { decision: "reject"; reason: string; optionId?: string };

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
