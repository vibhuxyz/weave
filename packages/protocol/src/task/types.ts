import type { Verification, VerificationRung } from "../verification/index.ts";
import type { TaskPolicy } from "./policy.ts";

export interface TaskContract {
  id: string;
  prompt: string;
  cwd: string;
  allowedPaths?: string[];
  policy?: TaskPolicy;
  readOnlyPaths?: string[];
  dependsOn?: string[];
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
