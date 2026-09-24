export interface RunPlanTask {
  readonly id: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
}

export type RunTaskStatus = "ok" | "failed" | "cancelled";

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
  | { readonly kind: "employee"; readonly taskId: string; readonly employeeId: string | null; readonly reason: string }
  | { readonly kind: "verification"; readonly taskId: string; readonly employeeId: string; readonly ok: boolean; readonly detail: string }
  | { readonly kind: "coordination"; readonly taskId: string | null; readonly event: string; readonly summary: string; readonly recipients: readonly string[] }
  | { readonly kind: "blocked"; readonly taskId: string; readonly reason: string }
  | {
      readonly kind: "decision";
      readonly workers: number;
      readonly reason: string;
      readonly benefitMs: { readonly timeSaved: number; readonly coordination: number; readonly mergeRisk: number; readonly verification: number; readonly startup: number; readonly total: number };
      readonly estimatedCostMicroUsd: string;
      readonly routes: readonly { readonly taskId: string; readonly kind: string; readonly engines: readonly string[]; readonly estimatedMs: number }[];
    }
  | { readonly kind: "budget"; readonly taskId: string | null; readonly scope: string; readonly key: string; readonly dimension: string; readonly limit: string; readonly spent: string; readonly action: string }
  | {
      readonly kind: "integration";
      readonly status: "ok" | "failed" | "unverified";
      readonly branch: string;
      readonly brokenBy: string | null;
    };

export type RunOutcome =
  | { readonly status: "ran"; readonly result: "ok" | "failed" | "cancelled" | "unverified"; readonly branch: string | null }
  | { readonly status: "refused" | "no-change-needed" | "error"; readonly reason: string };
