export interface AttemptRecord {
  readonly runId: string;
  readonly taskId: string;
  readonly kind: string;
  readonly sizeUnits: number;
  readonly engineId: string;
  readonly isOk: boolean;
  readonly wallMs: number;
  readonly costMicroUsd: bigint;
  readonly tokens: number;
}

export interface SettledRecord {
  readonly taskId: string;
  readonly concurrency: number;
  readonly overheadMs: number;
}

export interface RunHistory {
  readonly runId: string;
  readonly concurrency: number;
  readonly attempts: readonly AttemptRecord[];
  readonly settled: readonly SettledRecord[];
  readonly merges: number;
  readonly conflicts: number;
  readonly verifyMs: readonly number[];
}

export interface OutcomeStats {
  readonly attempts: number;
  readonly successes: number;
  readonly msPerUnit: number | null;
  readonly costMicroUsdPerUnit: bigint | null;
}

export interface EngineStats extends OutcomeStats {
  readonly byKind: ReadonlyMap<string, OutcomeStats>;
}

export interface Spend {
  readonly costMicroUsd: bigint;
  readonly tokens: number;
  readonly wallMs: number;
}

export interface HistoryStats {
  readonly runs: number;
  readonly engines: ReadonlyMap<string, EngineStats>;
  readonly startupMs: number | null;
  readonly coordinationMsPerWorker: number | null;
  readonly conflictRate: number | null;
  readonly verifyMs: number | null;
  readonly projectSpend: Spend;
}

export interface SkippedRun {
  readonly path: string;
  readonly reason: string;
}
