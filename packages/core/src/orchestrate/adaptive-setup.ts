import { ENGINES } from "@weave/agent";
import type { RunConfig } from "@weave/protocol";
import { affordableWorkers, BudgetManager, buildStats, logDecision, planOrchestration, type EngineCandidate, type HistoryRead, type HistoryStats, type OrchestrationDecision } from "../adaptive/index.ts";
import { concurrencyFor, type Decision, type DecisionReason } from "../decide/index.ts";
import type { PlannedTask } from "../planner/index.ts";
import { enginesFor } from "../run-plan/index.ts";
import type { Ledger } from "../shared/index.ts";
import type { AdaptiveOptions } from "./types.ts";

const SAFETY_REASONS: ReadonlySet<DecisionReason> = new Set(["unverifiable-task", "no-contract", "single-component"]);

export interface AdaptiveSetupInput {
  readonly adaptive: AdaptiveOptions;
  readonly config: RunConfig | undefined;
  readonly weaveDir: string;
  readonly ledger: Ledger;
  readonly tasks: readonly PlannedTask[];
  readonly baseline: Decision;
  readonly maxWorkers: number;
  readonly history: () => Promise<HistoryRead>;
}

export interface AdaptiveSetup {
  readonly decision: Decision;
  readonly isGuarded: boolean;
  readonly concurrency: number;
  readonly affordable: number | null;
  readonly orchestration: OrchestrationDecision;
  readonly routes: ReadonlyMap<string, readonly string[]>;
  readonly priorities: ReadonlyMap<string, number>;
  readonly budget: BudgetManager;
}

function capabilitiesOf(engineId: string): Record<string, boolean> {
  const declared = ENGINES[engineId]?.capabilities;
  return Object.fromEntries(Object.entries(declared ?? {}).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
}

export function engineCandidates(config: RunConfig | undefined): readonly EngineCandidate[] {
  return enginesFor(config).map((id) => ({ id, capabilities: capabilitiesOf(id) }));
}

function plannedWorkers(input: AdaptiveSetupInput, orchestration: OrchestrationDecision, isGuarded: boolean): OrchestrationDecision {
  const fromPlan = Math.min(input.tasks.length, input.maxWorkers);
  if (isGuarded || orchestration.workers >= fromPlan) return orchestration;
  return {
    ...orchestration,
    workers: fromPlan,
    reason: `${orchestration.reason}; the plan asks for ${input.tasks.length} task(s), so ${fromPlan} worker(s) run`,
  };
}

async function statsFor(input: AdaptiveSetupInput): Promise<HistoryStats> {
  if (input.adaptive.stats) return input.adaptive.stats;
  const history = await input.history();
  for (const skipped of history.skipped) input.ledger.append("error", { where: "adaptive.history", message: `${skipped.path}: ${skipped.reason}` });
  return buildStats(history.runs);
}

export async function adaptiveSetup(input: AdaptiveSetupInput): Promise<AdaptiveSetup> {
  const stats = await statsFor(input);
  const isGuarded = input.baseline.mode === "sequential" && SAFETY_REASONS.has(input.baseline.reason);
  const budgets = input.adaptive.budgets ?? {};
  const orchestration = planOrchestration({
    tasks: input.tasks,
    engines: engineCandidates(input.config),
    stats,
    maxWorkers: isGuarded ? 1 : input.maxWorkers,
    coldStartWorkers: concurrencyFor(input.baseline, input.tasks.length, input.maxWorkers),
    ...(input.adaptive.msPerMicroUsd === undefined ? {} : { msPerMicroUsd: input.adaptive.msPerMicroUsd }),
    ...(budgets.run?.maxWallMs === undefined ? {} : { maxRunWallMs: budgets.run.maxWallMs }),
  });
  logDecision(input.ledger, orchestration);
  const planned = plannedWorkers(input, orchestration, isGuarded);
  const decision: Decision = isGuarded ? input.baseline : { mode: planned.workers > 1 ? "parallel" : "sequential", reason: "adaptive" };
  return {
    decision,
    isGuarded,
    concurrency: planned.workers,
    affordable: affordableWorkers(budgets, stats.projectSpend),
    orchestration: planned,
    routes: new Map(orchestration.tasks.map((plan) => [plan.taskId, plan.route.engines])),
    priorities: new Map(orchestration.tasks.map((plan) => [plan.taskId, plan.priorityMs])),
    budget: new BudgetManager({ budgets, ledger: input.ledger, tasks: input.tasks, projectSpend: stats.projectSpend }),
  };
}
