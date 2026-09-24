import { medianOf } from "@weave/core";
import type { Comparison, PolicySummary, ScenarioRun } from "./types.ts";

const MIN_IMPROVEMENT = 0.05;

function summarize(runs: readonly ScenarioRun[]): PolicySummary {
  return {
    runs: runs.length,
    passed: runs.filter((run) => run.isOk).length,
    totalWallMs: runs.reduce((total, run) => total + run.wallMs, 0),
    medianWallMs: medianOf(runs.map((run) => run.wallMs)) ?? 0,
    totalCostMicroUsd: runs.reduce((total, run) => total + run.costMicroUsd, 0n),
  };
}

function relativeChange(before: number, after: number): number {
  return before === 0 ? 0 : (after - before) / before;
}

export function compareRuns(baselineRuns: readonly ScenarioRun[], adaptiveRuns: readonly ScenarioRun[]): Comparison {
  const baseline = summarize(baselineRuns);
  const adaptive = summarize(adaptiveRuns);
  const adaptiveById = new Map(adaptiveRuns.map((run) => [run.scenarioId, run]));
  const lostScenarios = baselineRuns.filter((run) => run.isOk && adaptiveById.get(run.scenarioId)?.isOk !== true).map((run) => run.scenarioId).sort();
  const wallChange = relativeChange(baseline.totalWallMs, adaptive.totalWallMs);
  const costChange = relativeChange(Number(baseline.totalCostMicroUsd), Number(adaptive.totalCostMicroUsd));
  const improved = [
    ...(adaptive.passed > baseline.passed ? ["pass rate"] : []),
    ...(wallChange <= -MIN_IMPROVEMENT ? ["wall time"] : []),
    ...(costChange <= -MIN_IMPROVEMENT ? ["cost"] : []),
  ];
  const isRegressed = lostScenarios.length > 0 || adaptive.passed < baseline.passed;
  const verdict = isRegressed ? "regressed" : improved.length > 0 ? "improved" : "no-improvement";
  return { baseline, adaptive, wallChange, costChange, lostScenarios, improved, verdict };
}
