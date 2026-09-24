import { create } from "zustand";
import type { OverviewState, ProjectMessage, QueryState } from "../types";

interface ProjectStore {
  readonly overview: OverviewState;
  readonly query: QueryState;
  readonly startOverview: () => void;
  readonly startQuery: (queryId: string, text: string) => void;
  readonly receive: (message: ProjectMessage) => void;
  readonly reset: () => void;
}

function isCurrentQuery(query: QueryState, queryId: string): boolean {
  return query.status !== "idle" && query.queryId === queryId;
}

function applyMessage(state: Pick<ProjectStore, "overview" | "query">, message: ProjectMessage): Partial<ProjectStore> {
  switch (message.type) {
    case "project-overview":
      return { overview: { status: "ready", overview: message.overview } };
    case "project-overview-failed":
      return { overview: { status: "error", message: message.message } };
    case "project-query-result":
      return isCurrentQuery(state.query, message.queryId) ? { query: { status: "ready", queryId: message.queryId, result: message.result } } : {};
    case "project-query-failed":
      return isCurrentQuery(state.query, message.queryId) ? { query: { status: "error", queryId: message.queryId, message: message.message } } : {};
    default: {
      const exhaustive: never = message;
      return exhaustive;
    }
  }
}

export const useProjectStore = create<ProjectStore>((set) => ({
  overview: { status: "idle" },
  query: { status: "idle" },
  startOverview: () => set((state) => (state.overview.status === "ready" ? state : { overview: { status: "loading" } })),
  startQuery: (queryId, text) => set({ query: { status: "loading", queryId, text } }),
  receive: (message) => set((state) => applyMessage(state, message)),
  reset: () => set({ overview: { status: "idle" }, query: { status: "idle" } }),
}));
