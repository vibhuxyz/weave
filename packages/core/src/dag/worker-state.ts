import { WORKER_STATUSES, type WorkerStatus } from "@weave/protocol";
import { WORKER_TRANSITIONS } from "./constants.ts";

export type WorkerTransition =
  | { readonly ok: true; readonly status: WorkerStatus }
  | { readonly ok: false; readonly reason: string };

export function isTerminalWorkerStatus(status: WorkerStatus): boolean {
  return WORKER_TRANSITIONS[status].length === 0;
}

export function canTransitionWorker(from: WorkerStatus, to: WorkerStatus): boolean {
  return WORKER_TRANSITIONS[from].includes(to);
}

export function transitionWorker(from: WorkerStatus, to: WorkerStatus): WorkerTransition {
  if (canTransitionWorker(from, to)) return { ok: true, status: to };
  const allowed = WORKER_TRANSITIONS[from];
  const detail = allowed.length === 0 ? `${from} is a final state` : `allowed: ${allowed.join(", ")}`;
  return { ok: false, reason: `A worker cannot move from ${from} to ${to} (${detail})` };
}

export function waitingWorkerStatuses(): readonly WorkerStatus[] {
  return WORKER_STATUSES.filter((status) => status.startsWith("waiting-") || status === "blocked");
}
