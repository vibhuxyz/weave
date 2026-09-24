import type { TaskDependency } from "@weave/protocol";

export interface DependencyEdge {
  readonly taskId: string;
  readonly dependency: TaskDependency;
}

export type AddDependencyResult =
  | { readonly ok: true; readonly isNew: boolean }
  | { readonly ok: false; readonly reason: string };

export interface Dependent {
  readonly consumer: string;
  readonly requiredOutputs: readonly string[];
}

export type ArtifactKind = "artifact" | "contract";

export interface ArtifactInput {
  readonly name: string;
  readonly summary: string;
  readonly files: readonly { readonly path: string; readonly content: string }[];
}
