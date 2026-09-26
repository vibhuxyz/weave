import type { ChatTurn } from "@/features/chat/hooks";
import type { BudgetAlert, NoteTone, RunArtifact, RunClassification, RunCritique, RunExecutionPlan, RunOutcome, RunPlanTask, RunTaskStatus, RunUpdate, RunWorkerCount, RungResult, ServerMessage } from "../../../server/index.ts";

export type RunMessage = Extract<ServerMessage, { readonly type: "run-started" | "run-update" | "run-finished" }>;

export type LaneStatus = "waiting" | "running" | RunTaskStatus;

export type MergeResult = Pick<Extract<RunUpdate, { readonly kind: "merge" }>, "status" | "detail">;

export type StreamBlockStatus = "running" | RunTaskStatus;

export interface StreamBlock {
  readonly id: string;
  readonly taskId: string;
  readonly attempt: number;
  readonly status: StreamBlockStatus;
  readonly turn: ChatTurn;
  readonly files: readonly string[];
  readonly hiddenFileCount: number;
  readonly hiddenToolCount: number;
}

export interface LaneNote {
  readonly id: number;
  readonly tone: NoteTone;
  readonly text: string;
}

export interface LaneEmployee {
  readonly employeeId: string | null;
  readonly reasons: readonly string[];
}

export interface AwaitedOutput {
  readonly output: string;
  readonly producer: string | null;
  readonly hasArrived: boolean;
}

export interface LaneVerification {
  readonly ok: boolean;
  readonly rungs: readonly RungResult[];
  readonly detail: string;
}

export interface Lane {
  readonly taskId: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
  readonly allowedPaths: readonly string[];
  readonly readOnlyPaths: readonly string[];
  readonly subtasks: readonly string[];
  readonly subtasksDone: readonly string[];
  readonly awaited: readonly AwaitedOutput[];
  readonly skills: readonly string[];
  readonly produces: readonly string[];
  readonly plannedEngineId: string | null;
  readonly verifyRung: string | null;
  readonly complexity: Exclude<RunPlanTask["complexity"], undefined> | null;
  readonly status: LaneStatus;
  readonly attempts: number;
  readonly settledCostUsd: number;
  readonly attemptCostUsd: number;
  readonly reason: string | null;
  readonly merge: MergeResult | null;
  readonly employee: LaneEmployee | null;
  readonly verification: LaneVerification | null;
  readonly claims: readonly string[];
  readonly blockedReason: string | null;
  readonly notes: readonly LaneNote[];
  readonly noteCount: number;
}

export type OrchestrationSummary = Omit<Extract<RunUpdate, { readonly kind: "orchestration" }>, "kind">;

export interface PlanningEnginesSummary {
  readonly planner: string | null;
  readonly reviewer: string | null;
}

export interface RunPlanSummary {
  readonly mode: "sequential" | "parallel";
  readonly reason: string;
  readonly goal: string | null;
  readonly assumptions: readonly string[];
  readonly risks: readonly string[];
}

export interface PlanReviewSummary {
  readonly classification: RunClassification | null;
  readonly critique: RunCritique | null;
  readonly warnings: readonly string[];
  readonly hiddenWarningCount: number;
}

export type IntegrationResult = Omit<Extract<RunUpdate, { readonly kind: "integration" }>, "kind">;

export type PlanApproval = "none" | "waiting" | "approved";

export interface RunArtifactEntry {
  readonly key: string;
  readonly producer: string;
  readonly artifact: RunArtifact;
  readonly deliveredTo: readonly string[];
}

export interface RunState {
  readonly runKey: string;
  readonly approval: PlanApproval;
  readonly request: string;
  readonly plan: RunPlanSummary | null;
  readonly review: PlanReviewSummary | null;
  readonly planning: PlanningEnginesSummary | null;
  readonly execution: RunExecutionPlan | null;
  readonly workerCount: RunWorkerCount | null;
  readonly artifacts: readonly RunArtifactEntry[];
  readonly hiddenArtifactCount: number;
  readonly lanes: Readonly<Record<string, Lane>>;
  readonly laneOrder: readonly string[];
  readonly stream: readonly StreamBlock[];
  readonly hiddenBlockCount: number;
  readonly contractVersion: number | null;
  readonly integration: IntegrationResult | null;
  readonly orchestration: OrchestrationSummary | null;
  readonly budgetAlerts: readonly BudgetAlert[];
  readonly hiddenAlertCount: number;
  readonly outcome: RunOutcome | null;
}
