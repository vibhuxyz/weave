export interface AttemptEstimate {
  readonly engineId: string;
  readonly ms: number;
  readonly costMicroUsd: bigint;
  readonly successProbability: number;
}

export interface ChainEstimate {
  readonly expectedMs: number;
  readonly expectedCostMicroUsd: bigint;
  readonly successProbability: number;
}

export interface GraphDependency {
  readonly task: string;
  readonly requiredOutputs?: readonly string[];
}

export interface GraphTask {
  readonly id: string;
  readonly dependencies?: readonly GraphDependency[];
}

export interface ScheduledInterval {
  readonly startMs: number;
  readonly endMs: number;
}

export interface Schedule {
  readonly makespanMs: number;
  readonly intervals: ReadonlyMap<string, ScheduledInterval>;
}
