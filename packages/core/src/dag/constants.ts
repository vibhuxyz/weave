import type { WorkerStatus } from "@weave/protocol";

export const WORKER_TRANSITIONS: Readonly<Record<WorkerStatus, readonly WorkerStatus[]>> = {
  created: ["starting", "cancelled"],
  starting: ["running", "failed", "cancelled"],
  running: [
    "waiting-for-artifact",
    "waiting-for-approval",
    "blocked",
    "verifying",
    "completed",
    "failed",
    "cancelled",
  ],
  "waiting-for-artifact": ["running", "blocked", "failed", "cancelled"],
  "waiting-for-approval": ["running", "blocked", "failed", "cancelled"],
  blocked: ["running", "failed", "cancelled"],
  verifying: ["running", "completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export const ENDED_STATES: ReadonlySet<string> = new Set(["failed", "cancelled", "skipped"]);
