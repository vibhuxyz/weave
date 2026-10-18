import { lanePhase } from "./lane-phase";
import type { Lane, RunState, StreamBlock } from "../types";

export interface RunHeader {
  readonly runKey: string | null;
  readonly approval: RunState["approval"];
  readonly request: string | null;
  readonly outcome: RunState["outcome"] | null;
  readonly laneOrder: readonly string[];
}

const NO_LANES: readonly string[] = [];
const NO_BLOCKS: readonly StreamBlock[] = [];

export function selectRunHeader(state: { readonly run: RunState | null }): RunHeader {
  return { runKey: state.run?.runKey ?? null, approval: state.run?.approval ?? "none", request: state.run?.request ?? null, outcome: state.run?.outcome ?? null, laneOrder: state.run?.laneOrder ?? NO_LANES };
}

export interface RouteNoteView {
  readonly reason: string | null;
  readonly request: string | null;
  readonly canKeepInChat: boolean;
}

export function selectRouteNote(state: { readonly run: RunState | null }): RouteNoteView {
  const run = state.run;
  return {
    reason: run?.routeReason ?? null,
    request: run?.request ?? null,
    canKeepInChat: run !== null && run.outcome === null && run.approval !== "approved",
  };
}

export interface ResultReviewView {
  readonly runKey: string | null;
  readonly outcome: RunState["outcome"] | null;
  readonly decision: RunState["resultDecision"];
}

export function selectResultReview(state: { readonly run: RunState | null }): ResultReviewView {
  return { runKey: state.run?.runKey ?? null, outcome: state.run?.outcome ?? null, decision: state.run?.resultDecision ?? null };
}

export function selectRepoSetup(state: { readonly run: RunState | null }): string | null {
  return state.run?.repoSetup ?? null;
}

export function selectIsRunActive(state: { readonly run: RunState | null }): boolean {
  return state.run !== null && state.run.outcome === null;
}

export function selectIsPlanOpen(state: { readonly run: RunState | null }): boolean {
  return state.run !== null && state.run.approval !== "approved";
}

export interface RunStreamView {
  readonly blocks: readonly StreamBlock[];
  readonly hiddenBlockCount: number;
  readonly outcome: RunState["outcome"] | null;
  readonly plannerLabel: string | null;
  readonly isPlanning: boolean;
  readonly hasLanes: boolean;
}

export function selectRunStream(state: { readonly run: RunState | null }): RunStreamView {
  const run = state.run;
  return {
    blocks: run?.stream ?? NO_BLOCKS,
    hiddenBlockCount: run?.hiddenBlockCount ?? 0,
    outcome: run?.outcome ?? null,
    plannerLabel: run?.planning?.planner ?? null,
    isPlanning: run !== null && run.plan === null && run.outcome === null,
    hasLanes: (run?.laneOrder.length ?? 0) > 0,
  };
}

export interface WorkforceView {
  readonly running: number;
  readonly waiting: number;
  readonly capacity: number;
}

export function selectWorkforce(state: { readonly run: RunState | null }): WorkforceView {
  const lanes = state.run?.lanes ?? {};
  const phases = Object.keys(lanes).map((taskId) => lanePhase(lanes[taskId] as Lane, lanes));
  return {
    running: phases.filter((phase) => phase === "running" || phase === "partially-blocked" || phase === "verifying").length,
    waiting: phases.filter((phase) => phase === "pending").length,
    capacity: state.run?.workerCount?.workers ?? 0,
  };
}
