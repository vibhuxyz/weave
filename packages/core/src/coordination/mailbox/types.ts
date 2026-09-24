import type { CoordinationEvent } from "@weave/protocol";

export interface InboxBatch {
  readonly events: readonly CoordinationEvent[];
  readonly droppedCount: number;
}

export type DependentsOf = (producer: string) => readonly { readonly consumer: string; readonly requiredOutputs: readonly string[] }[];
