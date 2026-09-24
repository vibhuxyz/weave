import type { CappedList, ProjectOverview, ProjectQueryResult, ServerMessage } from "../../../server/index.ts";

export type { CappedList, ProjectOverview, ProjectQueryResult };

export type ProjectMessage = Extract<ServerMessage, { readonly type: "project-overview" | "project-overview-failed" | "project-query-result" | "project-query-failed" }>;

export type OverviewState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly overview: ProjectOverview }
  | { readonly status: "error"; readonly message: string };

export type QueryState =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly queryId: string; readonly text: string }
  | { readonly status: "ready"; readonly queryId: string; readonly result: ProjectQueryResult }
  | { readonly status: "error"; readonly queryId: string; readonly message: string };

export interface ProjectActions {
  readonly readOverview: () => void;
  readonly queryProject: (text: string) => void;
}
