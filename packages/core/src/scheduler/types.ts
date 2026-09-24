import type { TaskContract } from "@weave/protocol";

export type ScheduledState = "pending" | "running" | "ok" | "failed" | "cancelled" | "skipped";

export type SchedulableTask = Pick<TaskContract, "id" | "dependencies">;

export interface SkippedTask {
  readonly taskId: string;
  readonly reason: string;
}

export interface ScheduleStep {
  readonly ready: readonly string[];
  readonly skipped: readonly SkippedTask[];
  readonly isFinished: boolean;
}

export type AvailableOutputs = ReadonlyMap<string, ReadonlySet<string>>;
