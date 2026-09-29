export const WORKER_STATUSES = [
  "created",
  "starting",
  "running",
  "waiting-for-artifact",
  "waiting-for-approval",
  "blocked",
  "verifying",
  "completed",
  "failed",
  "cancelled",
] as const;

export type WorkerStatus = (typeof WORKER_STATUSES)[number];

export interface WorkerRuntime {
  readonly engineId: string;
  readonly model: string | null;
  readonly employeeId: string | null;
}

export interface WorkerWorkspace {
  readonly path: string;
  readonly branch: string | null;
  readonly baseCommit: string | null;
}

export interface WorkerProgress {
  readonly completedSteps: number;
  readonly totalSteps: number | null;
}

export interface WorkerRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly runId: string;
  readonly taskId: string;
  readonly runtime: WorkerRuntime;
  readonly status: WorkerStatus;
  readonly progress: WorkerProgress;
  readonly currentActivity: string | null;
  readonly workspace: WorkerWorkspace | null;
  readonly startedAt: string | null;
  readonly updatedAt: string;
  readonly finishedAt: string | null;
}
