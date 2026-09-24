import { formatMicroUsd } from "@weave/core";
import type { Comparison, PolicySummary, ScenarioRun } from "./types.ts";

const MAX_LISTED_RUNS = 40;

function percent(change: number): string {
  return `${change > 0 ? "+" : ""}${(change * 100).toFixed(1)}%`;
}

function row(name: string, summary: PolicySummary): string {
  return `| ${name} | ${summary.passed}/${summary.runs} | ${Math.round(summary.totalWallMs)} ms | ${Math.round(summary.medianWallMs)} ms | ${formatMicroUsd(summary.totalCostMicroUsd)} |`;
}

function scenarioRows(baseline: readonly ScenarioRun[], adaptive: readonly ScenarioRun[]): readonly string[] {
  const adaptiveById = new Map(adaptive.map((run) => [run.scenarioId, run]));
  const rows = baseline.slice(0, MAX_LISTED_RUNS).map((run) => {
    const other = adaptiveById.get(run.scenarioId);
    const outcome = (entry: ScenarioRun | undefined): string => (entry ? `${entry.isOk ? "pass" : "FAIL"} ${entry.workers}w ${Math.round(entry.wallMs)}ms ${formatMicroUsd(entry.costMicroUsd)}` : "missing");
    return `| ${run.scenarioId} | ${run.shape} | ${outcome(run)} | ${outcome(other)} |`;
  });
  const more = baseline.length > MAX_LISTED_RUNS ? [`(+${baseline.length - MAX_LISTED_RUNS} more scenarios)`] : [];
  return [...rows, ...more];
}

function failureLines(runs: readonly ScenarioRun[]): readonly string[] {
  const failed = runs.filter((run) => run.failure !== null).slice(0, MAX_LISTED_RUNS);
  return failed.length === 0 ? [] : ["", "Failures:", ...failed.map((run) => `- ${run.scenarioId} ${run.policy}: ${run.failure}`)];
}

export function renderReport(comparison: Comparison, runs: { readonly baseline: readonly ScenarioRun[]; readonly adaptive: readonly ScenarioRun[] }): string {
  return [
    `Verdict: ${comparison.verdict}${comparison.improved.length > 0 ? ` (${comparison.improved.join(", ")})` : ""}`,
    `Wall time ${percent(comparison.wallChange)}, cost ${percent(comparison.costChange)}, scenarios lost: ${comparison.lostScenarios.join(", ") || "none"}`,
    "",
    "| policy | passed | total wall | median wall | cost |",
    "|---|---|---|---|---|",
    row("baseline", comparison.baseline),
    row("adaptive", comparison.adaptive),
    "",
    "| scenario | shape | baseline | adaptive |",
    "|---|---|---|---|",
    ...scenarioRows(runs.baseline, runs.adaptive),
    ...failureLines([...runs.baseline, ...runs.adaptive]),
  ].join("\n");
}
