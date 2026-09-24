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

export interface GraphTask {
  readonly id: string;
  readonly dependencies?: readonly { readonly task: string }[];
}

export interface ScheduledInterval {
  readonly startMs: number;
  readonly endMs: number;
}

export interface Schedule {
  readonly makespanMs: number;
  readonly intervals: ReadonlyMap<string, ScheduledInterval>;
}
