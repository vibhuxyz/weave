import { concurrencyFor, decide, planOrchestration, type EngineCandidate, type HistoryStats, type PlannedTask } from "@weave/core";
import type { VerificationRung } from "@weave/protocol";
import { hashSeed } from "./sim/rng.ts";
import type { PolicyChoice } from "./types.ts";

const VERIFIED_RUNGS: readonly VerificationRung[] = ["build"];
const SIM_CAPABILITIES: Readonly<Record<string, boolean>> = { fileEditing: true, toolCalls: true };

export function simCandidates(engineIds: readonly string[]): readonly EngineCandidate[] {
  return engineIds.map((id) => ({ id, capabilities: SIM_CAPABILITIES }));
}

function baselineWorkers(tasks: readonly PlannedTask[], maxWorkers: number): { readonly workers: number; readonly reason: string } {
  const decision = decide({ kind: "existing", tasks, hasContract: false, rungs: VERIFIED_RUNGS });
  return { workers: concurrencyFor(decision, tasks.length, maxWorkers), reason: decision.reason };
}

export function baselinePolicy(tasks: readonly PlannedTask[], configured: readonly string[], maxWorkers: number): PolicyChoice {
  return { name: "baseline", ...baselineWorkers(tasks, maxWorkers), engineOrderFor: () => configured, decision: null };
}

export function explorationPolicy(tasks: readonly PlannedTask[], configured: readonly string[], options: { readonly maxWorkers: number; readonly salt: string }): PolicyChoice {
  const rotated = (taskId: string): readonly string[] => {
    const shift = hashSeed(options.salt, taskId) % configured.length;
    return [...configured.slice(shift), ...configured.slice(0, shift)];
  };
  return { name: "exploration", ...baselineWorkers(tasks, options.maxWorkers), engineOrderFor: rotated, decision: null };
}

export function adaptivePolicy(tasks: readonly PlannedTask[], configured: readonly string[], options: { readonly maxWorkers: number; readonly stats: HistoryStats }): PolicyChoice {
  const coldStartWorkers = baselineWorkers(tasks, options.maxWorkers).workers;
  const decision = planOrchestration({ tasks, engines: simCandidates(configured), stats: options.stats, maxWorkers: options.maxWorkers, coldStartWorkers });
  const routes = new Map(decision.tasks.map((plan) => [plan.taskId, plan.route.engines]));
  return { name: "adaptive", workers: decision.workers, reason: decision.reason, engineOrderFor: (taskId) => routes.get(taskId) ?? configured, decision };
}
