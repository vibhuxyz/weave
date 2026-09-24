import type { ResourceRef } from "../coordination/index.ts";
import type { Verification, VerificationRung } from "../verification/index.ts";
import type { TaskPolicy } from "./policy.ts";

export interface TaskDependency {
  task: string;
  requiredOutputs: string[];
}

export interface TaskContract {
  id: string;
  prompt: string;
  cwd: string;
  allowedPaths?: string[];
  policy?: TaskPolicy;
  readOnlyPaths?: string[];
  owns?: ResourceRef[];
  dependencies?: TaskDependency[];
  verify?: string;
  sandboxed?: boolean;
  verifyRung?: VerificationRung;
}

export type TaskStatus = "pending" | "running" | "ok" | "failed" | "cancelled";

export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  stopReason?: string;
  wallMs: number;
  filesWritten: string[];
  filesChanged: string[];
  verification?: Verification;
  error?: string;
}
