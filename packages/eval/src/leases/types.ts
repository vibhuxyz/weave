import type { LeaseEvent, TaskState } from "@weave/core";

export interface SimulationConfig {
  readonly seed: string;
  readonly tasks: number;
  readonly workers: number;
  readonly leaseMs: number;
  readonly heartbeatMs: number;
  readonly sweepMs: number;
  readonly minTaskMs: number;
  readonly maxTaskMs: number;
  readonly verifyMs: number;
  readonly restartMs: number;
  readonly hangMs: number;
  readonly crashRate: number;
  readonly hangRate: number;
  readonly wrongOutputRate: number;
  readonly dependencyRate: number;
  readonly maxAttempts: number;
}

export type Fate =
  | { readonly kind: "finish"; readonly workMs: number }
  | { readonly kind: "wrong-output"; readonly workMs: number }
  | { readonly kind: "crash"; readonly afterMs: number }
  | { readonly kind: "hang"; readonly afterMs: number };

interface WorkerFields {
  readonly atMs: number;
  readonly workerId: string;
}

export type WorkerEvent =
  | (WorkerFields & { readonly type: "crashed"; readonly taskId: string; readonly token: number })
  | (WorkerFields & { readonly type: "hung"; readonly taskId: string; readonly token: number })
  | (WorkerFields & { readonly type: "woke"; readonly taskId: string; readonly token: number })
  | (WorkerFields & { readonly type: "restarted" });

export type SimEvent = LeaseEvent | WorkerEvent;

export interface SimulationResult {
  readonly config: SimulationConfig;
  readonly events: readonly SimEvent[];
  readonly heartbeats: number;
  readonly endedAtMs: number;
  readonly isComplete: boolean;
  readonly finalStates: Readonly<Record<TaskState, number>>;
  readonly busyMsByToken: ReadonlyMap<number, number>;
}

export interface BenchmarkRow {
  readonly label: string;
  readonly runs: number;
  readonly verifiedShare: number;
  readonly makespanMs: number;
  readonly throughputPerSecond: number;
  readonly recoveryP50Ms: number | null;
  readonly recoveryP95Ms: number | null;
  readonly takeovers: number;
  readonly fenced: number;
  readonly busyShare: number;
  readonly wastedShare: number;
  readonly violations: number;
  readonly wallMs: number;
}
