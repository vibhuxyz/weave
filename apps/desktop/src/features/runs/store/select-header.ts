import type { RunState } from "../types";

export interface RunHeader {
  readonly request: string | null;
  readonly outcome: RunState["outcome"] | null;
  readonly laneOrder: readonly string[];
}

const NO_LANES: readonly string[] = [];

export function selectRunHeader(state: { readonly run: RunState | null }): RunHeader {
  return { request: state.run?.request ?? null, outcome: state.run?.outcome ?? null, laneOrder: state.run?.laneOrder ?? NO_LANES };
}
