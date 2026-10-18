import type { PoolTaskReport } from "../pool/index.ts";
import type { RunPlanReport } from "../run-plan/index.ts";
import type { DeliveryPlan } from "./types.ts";
import { workerResultsOf } from "./worker-results.ts";

const STOPPED_DETAIL = "The run was stopped before anything was merged.";
const NOTHING_MERGED_DETAIL = "No worker finished its task, so nothing was merged.";

function filesOf(tasks: readonly PoolTaskReport[], isIncluded: (task: PoolTaskReport) => boolean): readonly string[] {
  return [...new Set(tasks.filter(isIncluded).flatMap((task) => task.harvest?.files ?? []))].sort();
}

export function deliveryPlanOf(report: RunPlanReport): DeliveryPlan | null {
  const { integration } = report;
  const tasks = report.pool.tasks;
  const sharedFiles = filesOf(tasks, (task) => task.ranIn === "shared");
  const head = integration?.head ?? null;
  if (head === null && sharedFiles.length === 0) return null;
  const merged = new Set((integration?.merges ?? []).filter((merge) => merge.status === "merged").map((merge) => merge.taskId));
  const notMergedDetail = report.status === "cancelled" ? STOPPED_DETAIL : NOTHING_MERGED_DETAIL;
  return {
    runId: report.runId,
    baseCommit: report.baseCommit,
    snapshotOf: report.snapshotOf,
    integrationHead: head,
    integrationStatus: integration && head !== null ? integration.status : "not-merged",
    detail: integration && head !== null ? integration.detail : notMergedDetail,
    sharedFiles,
    isolatedFiles: filesOf(tasks, (task) => task.ranIn === "worktree" && merged.has(task.taskId)),
    mergedFiles: filesOf(tasks, (task) => merged.has(task.taskId)),
    workers: workerResultsOf(report),
  };
}
