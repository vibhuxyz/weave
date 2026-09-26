import type { RunUpdate } from "../../../../server/index.ts";
import type { ReplanEntry, RunState } from "../types";

type RequestUpdate = Extract<RunUpdate, { readonly kind: "replan-requested" }>;
type DecisionUpdate = Extract<RunUpdate, { readonly kind: "replan-decided" }>;

export function withReplanRequest(run: RunState, update: RequestUpdate, maxEntries: number): RunState {
  if (run.replans.some((entry) => entry.round === update.round)) return run;
  if (run.replans.length >= maxEntries) return run;
  const entry: ReplanEntry = {
    round: update.round,
    triggers: update.triggers,
    hiddenTriggerCount: update.hiddenTriggerCount,
    action: null,
    reason: "",
    rerun: [],
    warnings: [],
  };
  return { ...run, replans: [...run.replans, entry] };
}

export function withReplanDecision(run: RunState, update: DecisionUpdate): RunState {
  const decided = { action: update.action, reason: update.reason, rerun: update.rerun, warnings: update.warnings };
  if (!run.replans.some((entry) => entry.round === update.round)) return run;
  return { ...run, replans: run.replans.map((entry) => (entry.round === update.round ? { ...entry, ...decided } : entry)) };
}
