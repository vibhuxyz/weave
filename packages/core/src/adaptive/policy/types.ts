import type { HistoryStats } from "../history/index.ts";
import type { EngineCandidate, EngineRoute, RoutableTask } from "../routing/index.ts";
import type { BenefitBreakdown } from "../workers/index.ts";

export interface OrchestrationTask extends RoutableTask {
  readonly dependencies?: readonly { readonly task: string }[];
}

export interface OrchestrationInput {
  readonly tasks: readonly OrchestrationTask[];
  readonly engines: readonly EngineCandidate[];
  readonly stats: HistoryStats;
  readonly maxWorkers: number;
  readonly msPerMicroUsd?: number;
  readonly maxRunWallMs?: number;
  readonly coldStartWorkers?: number;
}

export interface TaskPlan {
  readonly taskId: string;
  readonly kind: string;
  readonly sizeUnits: number;
  readonly estimatedMs: number;
  readonly priorityMs: number;
  readonly route: EngineRoute;
}

export interface OrchestrationDecision {
  readonly workers: number;
  readonly reason: string;
  readonly benefit: BenefitBreakdown;
  readonly considered: readonly BenefitBreakdown[];
  readonly estimatedCostMicroUsd: bigint;
  readonly tasks: readonly TaskPlan[];
}
