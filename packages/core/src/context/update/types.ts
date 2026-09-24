import type { ImpactReport } from "../impact/index.ts";

export interface ModelDelta {
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly files: { readonly added: readonly string[]; readonly removed: readonly string[]; readonly changed: readonly string[] };
  readonly symbols: { readonly added: readonly string[]; readonly removed: readonly string[]; readonly modified: readonly string[] };
  readonly impact: ImpactReport;
}
