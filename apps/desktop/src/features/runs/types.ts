import type { RunOutcome, RunTaskStatus, RunUpdate, ServerMessage } from "../../../server/index.ts";

export type RunMessage = Extract<ServerMessage, { readonly type: "run-started" | "run-update" | "run-finished" }>;

export type LaneStatus = "waiting" | "running" | RunTaskStatus;

export type MergeResult = Pick<Extract<RunUpdate, { readonly kind: "merge" }>, "status" | "detail">;

export interface LaneTool {
  readonly id: number;
  readonly title: string;
}

export interface Lane {
  readonly taskId: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
  readonly status: LaneStatus;
  readonly attempts: number;
  readonly text: string;
  readonly tools: readonly LaneTool[];
  readonly toolCount: number;
  readonly files: readonly string[];
  readonly hiddenFileCount: number;
  readonly settledCostUsd: number;
  readonly attemptCostUsd: number;
  readonly reason: string | null;
  readonly merge: MergeResult | null;
}

export interface RunPlanSummary {
  readonly mode: "sequential" | "parallel";
  readonly reason: string;
}

export type IntegrationResult = Omit<Extract<RunUpdate, { readonly kind: "integration" }>, "kind">;

export interface RunState {
  readonly runKey: string;
  readonly request: string;
  readonly plan: RunPlanSummary | null;
  readonly lanes: Readonly<Record<string, Lane>>;
  readonly laneOrder: readonly string[];
  readonly contractVersion: number | null;
  readonly integration: IntegrationResult | null;
  readonly outcome: RunOutcome | null;
}
