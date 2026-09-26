export type TaskComplexity = "low" | "medium" | "high";

export interface RunPlanTask {
  readonly id: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
  readonly allowedPaths: readonly string[];
  readonly readOnlyPaths?: readonly string[];
  readonly produces?: readonly string[];
  readonly subtasks?: readonly string[];
  readonly skills?: readonly string[];
  readonly complexity?: TaskComplexity;
  readonly employeeId?: string;
  readonly engineId?: string;
  readonly verifyRung?: string;
}

export type WorkerLimit = "plan" | "setting" | "machine" | "budget";

export interface RunWorkerCount {
  readonly workers: number;
  readonly limitedBy: WorkerLimit;
  readonly reason: string;
  readonly requested: number;
  readonly maxWorkers: number;
  readonly machineCapacity: number;
  readonly affordable: number | null;
}

export interface RunExecutionSlot {
  readonly taskId: string;
  readonly worker: number;
  readonly employeeId: string | null;
  readonly engineId: string | null;
  readonly fallbackEngineIds: readonly string[];
  readonly after: readonly string[];
  readonly startMs: number;
  readonly endMs: number;
}

export interface RunExecutionPlan {
  readonly workers: number;
  readonly timing: "estimated" | "order-only";
  readonly estimatedMs: number | null;
  readonly estimatedCostMicroUsd: string | null;
  readonly slots: readonly RunExecutionSlot[];
}

export interface RunCritique {
  readonly outcome: "approved" | "revised" | "kept";
  readonly issues: readonly { readonly type: string; readonly taskIds: readonly string[]; readonly reason: string }[];
}

export interface RunClassification {
  readonly taskType: string;
  readonly scope: string;
  readonly risk: "low" | "medium" | "high";
  readonly domains: readonly string[];
}

export type RunTaskStatus = "ok" | "failed" | "cancelled";

export type NoteTone = "info" | "warning";

export interface RungResult {
  readonly rung: string;
  readonly ok: boolean;
}

export interface BudgetAlert {
  readonly scope: "project" | "run" | "task" | "employee" | "engine";
  readonly key: string;
  readonly dimension: "cost" | "tokens" | "time";
  readonly limit: string;
  readonly spent: string;
  readonly action: "stop-task" | "stop-run" | "skip-task";
}

export type RunArtifactKind = "artifact" | "contract";

export interface RunArtifact {
  readonly name: string;
  readonly version: number;
  readonly summary: string;
  readonly kind: RunArtifactKind;
  readonly isUpdate: boolean;
}

export type RunReplanAction = "continue" | "rerun" | "stop";

export interface RunReplanTrigger {
  readonly kind: string;
  readonly taskId: string;
  readonly detail: string;
}

export interface RunReplanRerun {
  readonly id: string;
  readonly engineId: string | null;
}

export const RUN_TOOL_KINDS = ["read", "edit", "delete", "move", "search", "execute", "think", "fetch", "switch_mode", "other"] as const;

export type RunToolKind = (typeof RUN_TOOL_KINDS)[number];

export const RUN_TOOL_STATUSES = ["pending", "in_progress", "completed", "failed"] as const;

export type RunToolStatus = (typeof RUN_TOOL_STATUSES)[number];

export interface RunToolCall {
  readonly id: string;
  readonly title: string;
  readonly toolKind: RunToolKind;
  readonly status: RunToolStatus;
  readonly command?: string;
}

export interface RunToolPatch {
  readonly id: string;
  readonly title?: string;
  readonly toolKind?: RunToolKind;
  readonly status?: RunToolStatus;
}

export type MergeStatus = "merged" | "empty" | "conflict" | "merge-error" | "verify-failed";

export type RunUpdate =
  | {
      readonly kind: "plan";
      readonly mode: "sequential" | "parallel";
      readonly reason: string;
      readonly goal: string | null;
      readonly assumptions: readonly string[];
      readonly risks: readonly string[];
      readonly tasks: readonly RunPlanTask[];
    }
  | { readonly kind: "plan-review"; readonly classification: RunClassification | null; readonly critique: RunCritique | null; readonly warnings: readonly string[]; readonly hiddenWarningCount: number }
  | { readonly kind: "execution-plan"; readonly plan: RunExecutionPlan }
  | { readonly kind: "worker-count"; readonly count: RunWorkerCount }
  | { readonly kind: "planning"; readonly planner: string | null; readonly reviewer: string | null }
  | { readonly kind: "awaiting-approval" }
  | { readonly kind: "plan-approved" }
  | { readonly kind: "task-started"; readonly taskId: string }
  | { readonly kind: "text"; readonly taskId: string; readonly text: string }
  | { readonly kind: "thought"; readonly taskId: string; readonly text: string }
  | { readonly kind: "tool"; readonly taskId: string; readonly tool: RunToolCall }
  | { readonly kind: "tool-update"; readonly taskId: string; readonly tool: RunToolPatch }
  | { readonly kind: "file"; readonly taskId: string; readonly path: string }
  | { readonly kind: "cost"; readonly taskId: string; readonly costUsd: number }
  | { readonly kind: "task-settled"; readonly taskId: string; readonly status: RunTaskStatus; readonly reason: string | null }
  | { readonly kind: "merge"; readonly taskId: string; readonly status: MergeStatus; readonly detail: string }
  | { readonly kind: "contract-changed"; readonly version: number; readonly requestedBy: string; readonly rerun: readonly string[] }
  | { readonly kind: "employee-assigned"; readonly taskId: string; readonly employeeId: string | null; readonly reasons: readonly string[] }
  | { readonly kind: "employee-verified"; readonly taskId: string; readonly ok: boolean; readonly rungs: readonly RungResult[]; readonly detail: string }
  | { readonly kind: "replan-requested"; readonly round: number; readonly triggers: readonly RunReplanTrigger[]; readonly hiddenTriggerCount: number }
  | {
      readonly kind: "replan-decided";
      readonly round: number;
      readonly action: RunReplanAction;
      readonly reason: string;
      readonly rerun: readonly RunReplanRerun[];
      readonly warnings: readonly string[];
    }
  | { readonly kind: "subtask"; readonly taskId: string; readonly subtask: string; readonly index: number | null }
  | { readonly kind: "artifact"; readonly taskId: string; readonly artifact: RunArtifact }
  | { readonly kind: "awaiting"; readonly taskId: string; readonly output: string; readonly producer: string | null; readonly reason: string }
  | { readonly kind: "awaited-arrived"; readonly taskId: string; readonly output: string; readonly producer: string }
  | { readonly kind: "claimed"; readonly taskId: string; readonly resources: readonly string[] }
  | { readonly kind: "blocked"; readonly taskId: string; readonly reason: string }
  | { readonly kind: "dependency-added"; readonly taskId: string; readonly on: string; readonly reason: string }
  | { readonly kind: "note"; readonly taskId: string; readonly tone: NoteTone; readonly text: string }
  | { readonly kind: "orchestration"; readonly workers: number; readonly reason: string; readonly estimatedCostMicroUsd: string; readonly timeSavedMs: number }
  | { readonly kind: "budget-exceeded"; readonly alert: BudgetAlert }
  | {
      readonly kind: "integration";
      readonly status: "ok" | "failed" | "unverified";
      readonly branch: string;
      readonly brokenBy: string | null;
    };

export type RunOutcome =
  | { readonly status: "ran"; readonly result: "ok" | "failed" | "cancelled" | "unverified"; readonly branch: string | null }
  | { readonly status: "refused" | "no-change-needed" | "error" | "needs-git"; readonly reason: string };
