import type { WorkerLimit } from "@weave/protocol";
import type { WorkerCapacity, WorkerCount } from "./types.ts";

const MIN_WORKERS = 1;

interface Constraint {
  readonly limit: WorkerLimit;
  readonly workers: number;
  readonly describe: (workers: number) => string;
}

function constraintsOf(capacity: WorkerCapacity): readonly Constraint[] {
  const { requested, maxWorkers, machineCapacity, affordable } = capacity;
  return [
    { limit: "plan", workers: requested, describe: (workers) => `the plan asks for ${workers}` },
    { limit: "setting", workers: maxWorkers, describe: (workers) => `this project allows ${workers} at a time` },
    { limit: "machine", workers: machineCapacity, describe: (workers) => `this machine can run ${workers} at a time` },
    ...(affordable === null ? [] : [{ limit: "budget" as const, workers: affordable, describe: (workers: number) => `the cost limits afford ${workers}` }]),
  ];
}

export function resolveWorkerCount(capacity: WorkerCapacity): WorkerCount {
  const constraints = constraintsOf(capacity).map((constraint) => ({ ...constraint, workers: Math.max(MIN_WORKERS, Math.floor(constraint.workers)) }));
  const workers = Math.min(...constraints.map((constraint) => constraint.workers));
  const binding = constraints.filter((constraint) => constraint.workers === workers);
  const first = binding[0];
  const reason = `${workers} ${workers === 1 ? "worker" : "workers"}: ${binding.map((constraint) => constraint.describe(constraint.workers)).join(", ")}`;
  return { workers, limitedBy: first?.limit ?? "plan", reason };
}
