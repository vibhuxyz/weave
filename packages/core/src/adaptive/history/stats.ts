import { medianBigInt, medianOf } from "../../shared/index.ts";
import type { AttemptRecord, EngineStats, HistoryStats, OutcomeStats, RunHistory, SettledRecord, Spend } from "./types.ts";

function outcomeOf(attempts: readonly AttemptRecord[]): OutcomeStats {
  const timed = attempts.filter((attempt) => attempt.isOk);
  return {
    attempts: attempts.length,
    successes: timed.length,
    msPerUnit: medianOf(attempts.map((attempt) => attempt.wallMs / attempt.sizeUnits)),
    costMicroUsdPerUnit: medianBigInt(attempts.map((attempt) => attempt.costMicroUsd / BigInt(attempt.sizeUnits))),
  };
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): ReadonlyMap<string, readonly T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function engineStats(attempts: readonly AttemptRecord[]): ReadonlyMap<string, EngineStats> {
  return new Map([...groupBy(attempts, (attempt) => attempt.engineId)].map(([engineId, records]) => {
    const byKind = new Map([...groupBy(records, (attempt) => attempt.kind)].map(([kind, kindRecords]) => [kind, outcomeOf(kindRecords)]));
    return [engineId, { ...outcomeOf(records), byKind }];
  }));
}

function coordinationPerWorker(settled: readonly SettledRecord[]): number | null {
  const byConcurrency = groupBy(settled, (record) => String(record.concurrency));
  const single = medianOf((byConcurrency.get("1") ?? []).map((record) => record.overheadMs));
  if (single === null) return null;
  const slopes = [...byConcurrency.entries()].flatMap(([concurrency, records]) => {
    const workers = Number(concurrency);
    const overhead = medianOf(records.map((record) => record.overheadMs));
    return workers > 1 && overhead !== null ? [(overhead - single) / (workers - 1)] : [];
  });
  const slope = medianOf(slopes);
  return slope === null ? null : Math.max(0, slope);
}

function spendOf(attempts: readonly AttemptRecord[]): Spend {
  return attempts.reduce<Spend>(
    (total, attempt) => ({ costMicroUsd: total.costMicroUsd + attempt.costMicroUsd, tokens: total.tokens + attempt.tokens, wallMs: total.wallMs + attempt.wallMs }),
    { costMicroUsd: 0n, tokens: 0, wallMs: 0 },
  );
}

export function buildStats(runs: readonly RunHistory[]): HistoryStats {
  const attempts = runs.flatMap((run) => run.attempts);
  const settled = runs.flatMap((run) => run.settled);
  const merges = runs.reduce((total, run) => total + run.merges, 0);
  const conflicts = runs.reduce((total, run) => total + run.conflicts, 0);
  return {
    runs: runs.length,
    engines: engineStats(attempts),
    startupMs: medianOf(settled.map((record) => record.overheadMs)),
    coordinationMsPerWorker: coordinationPerWorker(settled),
    conflictRate: merges === 0 ? null : conflicts / merges,
    verifyMs: medianOf(runs.flatMap((run) => run.verifyMs)),
    projectSpend: spendOf(attempts),
  };
}
