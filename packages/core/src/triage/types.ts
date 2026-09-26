import type { PlanClassification, ProjectKind } from "../planner/index.ts";

export interface TriageInput {
  readonly request: string;
  readonly kind: ProjectKind;
  readonly filePaths: ReadonlySet<string>;
}

export type Triage =
  | { readonly route: "fast"; readonly path: string; readonly reason: string; readonly classification: PlanClassification }
  | { readonly route: "plan"; readonly reason: string };
