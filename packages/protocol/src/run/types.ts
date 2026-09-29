export const RUN_STATUSES = [
  "pending",
  "planning",
  "running",
  "integrating",
  "completed",
  "failed",
  "cancelled",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_MODES = ["sequential", "parallel"] as const;

export type RunMode = (typeof RUN_MODES)[number];

export interface RunRepository {
  readonly root: string;
  readonly remote: string | null;
  readonly baseCommit: string | null;
}

export interface RunConfiguration {
  readonly mode: RunMode;
  readonly maxWorkers: number;
  readonly engineId: string | null;
  readonly sandboxed: boolean;
}

export interface RunRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly repository: RunRepository;
  readonly status: RunStatus;
  readonly branch: string | null;
  readonly prompt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly finishedAt: string | null;
  readonly configuration: RunConfiguration;
}
