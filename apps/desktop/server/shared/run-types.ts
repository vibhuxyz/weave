export interface RunPlanTask {
  readonly id: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
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

export type MergeStatus = "merged" | "empty" | "conflict" | "merge-error" | "verify-failed";

export type RunUpdate =
  | {
      readonly kind: "plan";
      readonly mode: "sequential" | "parallel";
      readonly reason: string;
      readonly tasks: readonly RunPlanTask[];
    }
  | { readonly kind: "task-started"; readonly taskId: string }
  | { readonly kind: "text"; readonly taskId: string; readonly text: string }
  | { readonly kind: "tool"; readonly taskId: string; readonly title: string }
  | { readonly kind: "file"; readonly taskId: string; readonly path: string }
  | { readonly kind: "cost"; readonly taskId: string; readonly costUsd: number }
  | { readonly kind: "task-settled"; readonly taskId: string; readonly status: RunTaskStatus; readonly reason: string | null }
  | { readonly kind: "merge"; readonly taskId: string; readonly status: MergeStatus; readonly detail: string }
  | { readonly kind: "contract-changed"; readonly version: number; readonly requestedBy: string; readonly rerun: readonly string[] }
  | { readonly kind: "employee-assigned"; readonly taskId: string; readonly employeeId: string | null; readonly reasons: readonly string[] }
  | { readonly kind: "employee-verified"; readonly taskId: string; readonly ok: boolean; readonly rungs: readonly RungResult[]; readonly detail: string }
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
  | { readonly status: "refused" | "no-change-needed" | "error"; readonly reason: string };
