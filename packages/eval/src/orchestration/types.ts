import type { OrchestrationDecision } from "@weave/core";
import type { ScenarioShape } from "./sim/index.ts";

export type PolicyName = "baseline" | "exploration" | "adaptive";

export interface PolicyChoice {
  readonly name: PolicyName;
  readonly workers: number;
  readonly reason: string;
  readonly engineOrderFor: (taskId: string) => readonly string[];
  readonly decision: OrchestrationDecision | null;
}

export interface ScenarioRun {
  readonly scenarioId: string;
  readonly shape: ScenarioShape;
  readonly policy: PolicyName;
  readonly workers: number;
  readonly isOk: boolean;
  readonly failure: string | null;
  readonly wallMs: number;
  readonly costMicroUsd: bigint;
}

export interface PolicySummary {
  readonly runs: number;
  readonly passed: number;
  readonly totalWallMs: number;
  readonly medianWallMs: number;
  readonly totalCostMicroUsd: bigint;
}

export interface Comparison {
  readonly baseline: PolicySummary;
  readonly adaptive: PolicySummary;
  readonly wallChange: number;
  readonly costChange: number;
  readonly lostScenarios: readonly string[];
  readonly improved: readonly string[];
  readonly verdict: "improved" | "no-improvement" | "regressed";
}
