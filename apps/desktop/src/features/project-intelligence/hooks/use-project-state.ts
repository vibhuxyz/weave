import { useProjectStore } from "../store";
import type { OverviewState, QueryState } from "../types";

export function useOverviewState(): OverviewState {
  return useProjectStore((state) => state.overview);
}

export function useQueryState(): QueryState {
  return useProjectStore((state) => state.query);
}
