import { realChecksOf, type MergeReport, type MergeStatus } from "../integrator/index.ts";
import type { PoolTaskReport } from "../pool/index.ts";
import type { RunPlanReport } from "../run-plan/index.ts";
import type { WorkerResult, WorkerState } from "./types.ts";

const REJECTING_MERGES: ReadonlySet<MergeStatus> = new Set(["conflict", "merge-error", "verify-failed"]);

function stateOf(task: PoolTaskReport, merge: MergeReport | undefined): WorkerState {
  if (task.status === "failed") return task.isRejected ? "rejected" : "failed";
  if (task.status !== "ok") return task.status;
  if (merge === undefined) return "completed";
  if (REJECTING_MERGES.has(merge.status)) return "rejected";
  return merge.status === "merged" && realChecksOf(merge.rungs).length > 0 ? "verified" : "completed";
}

function reasonOf(task: PoolTaskReport, merge: MergeReport | undefined): string | null {
  if (task.reason !== null) return task.reason;
  return merge === undefined || merge.status === "merged" ? null : merge.detail;
}

function resultOf(task: PoolTaskReport, merge: MergeReport | undefined): WorkerResult {
  return {
    taskId: task.taskId,
    state: stateOf(task, merge),
    reason: reasonOf(task, merge),
    ranIn: task.ranIn,
    branch: task.branch,
    commit: task.harvest?.commit ?? null,
    files: task.harvest?.files ?? [],
    merge: merge ? { status: merge.status, checks: realChecksOf(merge.rungs), detail: merge.detail } : null,
  };
}

export function workerResultsOf(report: RunPlanReport): readonly WorkerResult[] {
  const mergesByTask = new Map((report.integration?.merges ?? []).map((merge) => [merge.taskId, merge]));
  return report.pool.tasks.map((task) => resultOf(task, mergesByTask.get(task.taskId)));
}
