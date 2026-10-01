import type { ResourceRef } from "../coordination/index.ts";
import type { Verification, VerificationRung } from "../verification/index.ts";
import type { TaskPolicy } from "./policy.ts";

export const TASK_COMPLEXITIES = ["low", "medium", "high"] as const;

export type TaskComplexity = (typeof TASK_COMPLEXITIES)[number];

export interface TaskDependency {
  task: string;
  requiredOutputs: string[];
}

export interface SharedWorker {
  id: string;
  allowedPaths: string[];
}

export interface TaskContract {
  id: string;
  prompt: string;
  cwd: string;
  allowedPaths?: string[];
  policy?: TaskPolicy;
  readOnlyPaths?: string[];
  owns?: ResourceRef[];
  capabilities?: string[];
  skills?: string[];
  produces?: string[];
  subtasks?: string[];
  complexity?: TaskComplexity;
  employee?: string;
  engine?: string;
  dependencies?: TaskDependency[];
  verify?: string;
  sandboxed?: boolean;
  verifyRung?: VerificationRung;
  sharedWith?: SharedWorker[];
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
