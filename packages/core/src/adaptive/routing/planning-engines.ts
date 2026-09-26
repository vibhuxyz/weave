import type { EngineCandidate } from "./types.ts";

const PLANNING_CAPABILITY = "planning";

export interface PlanningEngines {
  readonly plannerId: string | undefined;
  readonly reviewerId: string | undefined;
}

export function choosePlanningEngines(candidates: readonly EngineCandidate[]): PlanningEngines {
  const plannerId = candidates[0]?.id;
  const reviewer = candidates.find((candidate) => candidate.id !== plannerId && candidate.capabilities[PLANNING_CAPABILITY] === true);
  return { plannerId, reviewerId: reviewer?.id ?? plannerId };
}
