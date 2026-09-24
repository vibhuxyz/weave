import type { ResourceRef } from "@weave/protocol";
import type { HistoryStats } from "../history/index.ts";

export interface BenefitTask {
  readonly id: string;
  readonly allowedPaths?: readonly string[];
  readonly owns?: readonly ResourceRef[];
  readonly dependencies?: readonly { readonly task: string }[];
}

export interface BenefitBreakdown {
  readonly workers: number;
  readonly makespanMs: number;
  readonly timeSaved: number;
  readonly coordination: number;
  readonly mergeRisk: number;
  readonly verification: number;
  readonly startup: number;
  readonly total: number;
}

export interface WorkerCountInput {
  readonly tasks: readonly BenefitTask[];
  readonly durationOf: (taskId: string) => number;
  readonly stats: HistoryStats;
  readonly maxWorkers: number;
  readonly startupMs: number;
  readonly maxWallMs?: number;
}

export interface WorkerCountChoice {
  readonly workers: number;
  readonly reason: string;
  readonly chosen: BenefitBreakdown;
  readonly considered: readonly BenefitBreakdown[];
}
