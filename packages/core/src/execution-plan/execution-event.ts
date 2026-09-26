import type { ExecutionPlan, ExecutionPlanEvent } from "./types.ts";

export function executionPlanEvent(plan: ExecutionPlan): ExecutionPlanEvent {
  return {
    workers: plan.workers,
    timing: plan.timing,
    estimatedMs: plan.estimatedMs === null ? null : Math.round(plan.estimatedMs),
    estimatedCostMicroUsd: plan.estimatedCostMicroUsd === null ? null : plan.estimatedCostMicroUsd.toString(),
    slots: plan.slots.map((slot) => ({ ...slot, fallbackEngineIds: [...slot.fallbackEngineIds], after: [...slot.after], startMs: Math.round(slot.startMs), endMs: Math.round(slot.endMs) })),
  };
}
