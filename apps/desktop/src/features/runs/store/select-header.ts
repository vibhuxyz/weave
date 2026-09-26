import type { RunState, StreamBlock } from "../types";

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
}

export function selectRunStream(state: { readonly run: RunState | null }): RunStreamView {
  const run = state.run;
  return {
    blocks: run?.stream ?? NO_BLOCKS,
    hiddenBlockCount: run?.hiddenBlockCount ?? 0,
    outcome: run?.outcome ?? null,
    plannerLabel: run?.planning?.planner ?? null,
    isPlanning: run !== null && run.plan === null && run.outcome === null,
  };
}
