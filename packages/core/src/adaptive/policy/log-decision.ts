import type { Ledger } from "../../shared/index.ts";
import type { OrchestrationDecision } from "./types.ts";

export function logDecision(ledger: Ledger, decision: OrchestrationDecision): void {
  const { timeSaved, coordination, mergeRisk, verification, startup, total } = decision.benefit;
  const round = (ms: number): number => Math.round(ms);
  ledger.append("orchestration.decided", {
    workers: decision.workers,
    reason: decision.reason,
    benefitMs: { timeSaved: round(timeSaved), coordination: round(coordination), mergeRisk: round(mergeRisk), verification: round(verification), startup: round(startup), total: round(total) },
    estimatedCostMicroUsd: decision.estimatedCostMicroUsd.toString(),
    tasks: decision.tasks.map((plan) => ({ taskId: plan.taskId, kind: plan.kind, sizeUnits: plan.sizeUnits, engines: [...plan.route.engines], estimatedMs: round(plan.estimatedMs) })),
  });
}
