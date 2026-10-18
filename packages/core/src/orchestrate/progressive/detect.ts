import { DISCOVERY_REASON, MAX_PLAN_ATTEMPTS, SPLIT_REASON } from "./constants.ts";
import type { Assessment, OrchestrationPhase, WorkArea } from "./types.ts";

export function planTrigger(input: {
  readonly assessment: Assessment;
  readonly discovered: readonly WorkArea[];
  readonly phase: OrchestrationPhase;
  readonly attempts: number;
  readonly isSplitSuggested: boolean;
}): string | null {
  if (input.phase === "expanded" || input.phase === "planning" || input.attempts >= MAX_PLAN_ATTEMPTS) return null;
  if (input.isSplitSuggested) return SPLIT_REASON;
  if (input.phase === "direct" && input.assessment.decision === "plan") return input.assessment.reason;
  const known = new Set(input.assessment.areas.map((area) => area.dir));
  const fresh = input.discovered.filter((area) => !known.has(area.dir));
  const total = new Set([...known, ...input.discovered.map((area) => area.dir)]);
  if (total.size < 2 || fresh.length === 0) return null;
  return DISCOVERY_REASON;
}
