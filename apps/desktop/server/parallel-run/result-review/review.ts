import type { DeliveryPlan, WorkerResult } from "@weave/core";
import type { RunReview, RunReviewWorker } from "../../shared/index.ts";
import { MAX_DETAIL_CHARS } from "../constants.ts";
import { MAX_REVIEW_FILES, MAX_REVIEW_WORKERS } from "./constants.ts";

function reviewWorkerOf(worker: WorkerResult): RunReviewWorker {
  return {
    taskId: worker.taskId,
    state: worker.state,
    reason: worker.reason === null ? null : worker.reason.slice(0, MAX_DETAIL_CHARS),
    fileCount: worker.files.length,
    commit: worker.commit,
    checks: worker.merge?.checks ?? [],
  };
}

export function reviewOf(plan: DeliveryPlan): RunReview {
  const status = plan.integrationStatus;
  return {
    status,
    detail: plan.detail.slice(0, MAX_DETAIL_CHARS),
    files: plan.mergedFiles.slice(0, MAX_REVIEW_FILES),
    hiddenFileCount: Math.max(0, plan.mergedFiles.length - MAX_REVIEW_FILES),
    workers: plan.workers.slice(0, MAX_REVIEW_WORKERS).map(reviewWorkerOf),
    hiddenWorkerCount: Math.max(0, plan.workers.length - MAX_REVIEW_WORKERS),
    canAccept: status === "ok" || status === "unverified",
  };
}
