import type { ResourceRef } from "@weave/protocol";

export interface ClaimConflict {
  readonly resource: ResourceRef;
  readonly heldBy: string;
  readonly held: ResourceRef;
}

export type ClaimResult =
  | { readonly ok: true; readonly resources: readonly ResourceRef[] }
  | { readonly ok: false; readonly conflicts: readonly ClaimConflict[] };
