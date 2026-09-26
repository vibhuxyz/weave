import { resolveWorkerCount, type WorkerCount } from "../../decide/index.ts";
import type { Ledger } from "../../shared/index.ts";

export interface WorkerCountInput {
  readonly ledger: Ledger;
  readonly requested: number;
  readonly maxWorkers: number;
  readonly machineCapacity: number;
  readonly affordable: number | null;
}

export function countWorkers(input: WorkerCountInput): WorkerCount {
  const { ledger, ...capacity } = input;
  const count = resolveWorkerCount(capacity);
  ledger.append("plan.workers", { ...capacity, workers: count.workers, limitedBy: count.limitedBy, reason: count.reason });
  return count;
}
