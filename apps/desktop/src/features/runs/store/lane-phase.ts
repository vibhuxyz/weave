import type { MergeStatus } from "../../../../server/index.ts";
import type { Lane, LaneStatus, TaskPhase } from "../types";

const SETTLED: ReadonlySet<LaneStatus> = new Set(["ok", "failed", "rejected", "cancelled"]);
const REJECTING_MERGES: ReadonlySet<MergeStatus> = new Set(["conflict", "merge-error", "verify-failed"]);
const FINISHED_PHASES: ReadonlySet<TaskPhase> = new Set(["completed", "verified", "rejected", "failed"]);

export function laneProgress(lane: Lane): number | null {
  if (lane.subtasks.length === 0) return null;
  const done = lane.subtasksDone.filter((subtask) => lane.subtasks.includes(subtask)).length;
  return Math.round((done / lane.subtasks.length) * 100);
}

function finishedPhase(lane: Lane): TaskPhase {
  const { merge, verification } = lane;
  if (merge && REJECTING_MERGES.has(merge.status)) return "rejected";
  if (merge?.status === "merged" && merge.checks.length > 0) return "verified";
  return verification?.verdict === "passed" ? "verified" : "completed";
}

function isFinishedPhase(phase: TaskPhase): boolean {
  return FINISHED_PHASES.has(phase);
}

export function lanePhase(lane: Lane, lanes: Readonly<Record<string, Lane>>): TaskPhase {
  if (lane.status === "ok") return finishedPhase(lane);
  if (lane.status === "rejected") return "rejected";
  if (lane.status === "failed" || lane.status === "cancelled") return "failed";

  if (lane.status === "running") {
    if (lane.verifyingRung !== null) return "verifying";
    return lane.awaited.some((entry) => !entry.hasArrived) ? "partially-blocked" : "running";
  }

  const gating = lane.startsAfter.length > 0 ? lane.startsAfter : lane.dependsOn;
  const blocked = gating.some((producer) => {
    const upstream = lanes[producer];
    return upstream !== undefined && !SETTLED.has(upstream.status);
  });
  return blocked ? "pending" : "ready";
}

export function runProgress(lanes: Readonly<Record<string, Lane>>, order: readonly string[]): number {
  if (order.length === 0) return 0;
  const total = order.reduce((sum, taskId) => {
    const lane = lanes[taskId];
    if (!lane) return sum;
    if (isFinishedPhase(lanePhase(lane, lanes))) return sum + 100;
    return sum + (laneProgress(lane) ?? 0);
  }, 0);
  return Math.round(total / order.length);
}
