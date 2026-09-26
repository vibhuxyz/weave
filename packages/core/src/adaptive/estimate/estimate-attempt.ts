import type { TaskComplexity } from "@weave/protocol";
import type { EngineStats, HistoryStats, OutcomeStats } from "../history/index.ts";
import { COMPLEXITY_PRIOR_MS, DEFAULT_MS_PER_UNIT, KIND_PRIOR_WEIGHT } from "./constants.ts";
import type { AttemptEstimate, ChainEstimate } from "./types.ts";

export interface AttemptQuery {
  readonly engineId: string;
  readonly kind: string;
  readonly sizeUnits: number;
  readonly complexity?: TaskComplexity;
}

function engineSuccess(engine: OutcomeStats | undefined): number {
  return ((engine?.successes ?? 0) + 1) / ((engine?.attempts ?? 0) + 2);
}

function kindSuccess(engine: EngineStats | undefined, kind: string): number {
  const prior = engineSuccess(engine);
  const evidence = engine?.byKind.get(kind);
  return ((evidence?.successes ?? 0) + KIND_PRIOR_WEIGHT * prior) / ((evidence?.attempts ?? 0) + KIND_PRIOR_WEIGHT);
}

function learnedAverageMsPerUnit(stats: HistoryStats): number | null {
  const all = [...stats.engines.values()].flatMap((engine) => (engine.msPerUnit === null ? [] : [engine.msPerUnit]));
  return all.length === 0 ? null : all.reduce((total, value) => total + value, 0) / all.length;
}

function unlearnedMs(stats: HistoryStats, query: AttemptQuery): number {
  const average = learnedAverageMsPerUnit(stats);
  if (average !== null) return average * query.sizeUnits;
  return query.complexity ? COMPLEXITY_PRIOR_MS[query.complexity] : DEFAULT_MS_PER_UNIT * query.sizeUnits;
}

export function estimateAttempt(stats: HistoryStats, query: AttemptQuery): AttemptEstimate {
  const engine = stats.engines.get(query.engineId);
  const byKind = engine?.byKind.get(query.kind);
  const learnedMsPerUnit = byKind?.msPerUnit ?? engine?.msPerUnit ?? null;
  const costPerUnit = byKind?.costMicroUsdPerUnit ?? engine?.costMicroUsdPerUnit ?? 0n;
  return {
    engineId: query.engineId,
    ms: learnedMsPerUnit === null ? unlearnedMs(stats, query) : learnedMsPerUnit * query.sizeUnits,
    costMicroUsd: costPerUnit * BigInt(query.sizeUnits),
    successProbability: kindSuccess(engine, query.kind),
  };
}

export function estimateChain(attempts: readonly AttemptEstimate[]): ChainEstimate {
  let reachProbability = 1;
  let expectedMs = 0;
  let expectedCost = 0;
  for (const attempt of attempts) {
    expectedMs += reachProbability * attempt.ms;
    expectedCost += reachProbability * Number(attempt.costMicroUsd);
    reachProbability *= 1 - attempt.successProbability;
  }
  return { expectedMs, expectedCostMicroUsd: BigInt(Math.round(expectedCost)), successProbability: 1 - reachProbability };
}
