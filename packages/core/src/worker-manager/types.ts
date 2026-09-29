import type { WorkerStatus } from "@weave/protocol";
import type { WorkerOutcome } from "../pool/index.ts";

export const CAPABILITIES = [
  "repository-investigation",
  "frontend",
  "backend",
  "database",
  "testing",
  "devops",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export interface RuntimeProfile {
  readonly id: string;
  readonly capabilities: readonly Capability[];
}

export interface RuntimeChoice {
  readonly runtimeId: string;
  readonly required: readonly Capability[];
  readonly matched: readonly Capability[];
  readonly missing: readonly Capability[];
  readonly reason: string;
}

export type StopReason = "timeout" | "stalled" | "cancelled";

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly backoffMs: number;
  readonly isRetryable?: (outcome: WorkerOutcome) => boolean;
}

export interface AttemptInspection {
  readonly checkpoint: string | null;
  readonly modifiedFiles: readonly string[];
  readonly isDirty: boolean;
  readonly truncated: boolean;
}

export interface WorkerAttempt {
  readonly attempt: number;
  readonly workerId: string;
  readonly runtimeId: string;
  readonly statuses: readonly WorkerStatus[];
  readonly status: WorkerOutcome["status"];
  readonly stoppedBy: StopReason | null;
  readonly reason: string | null;
  readonly inspection: AttemptInspection | null;
}

export interface WorkerTrace {
  readonly taskId: string;
  readonly choice: RuntimeChoice;
  readonly attempts: readonly WorkerAttempt[];
}
