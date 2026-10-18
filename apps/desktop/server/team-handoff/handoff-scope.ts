import { mayOverlap, type TeamHandoff } from "@weave/core";

export const MAX_REPORTED_CONFLICTS = 10;

export interface ScopeConflict {
  readonly path: string;
  readonly takenBy: string;
}

export function scopeConflicts(uncommitted: readonly string[], handoff: TeamHandoff): readonly ScopeConflict[] {
  const conflicts: ScopeConflict[] = [];
  for (const path of [...uncommitted].sort()) {
    const owner = handoff.remaining.find((item) => item.paths.some((scope) => mayOverlap(scope, path)));
    if (owner) conflicts.push({ path, takenBy: owner.id });
  }
  return conflicts;
}

export function describeConflicts(conflicts: readonly ScopeConflict[]): string {
  const shown = conflicts.slice(0, MAX_REPORTED_CONFLICTS);
  const more = conflicts.length > shown.length ? ` (+${conflicts.length - shown.length} more)` : "";
  const list = shown.map((conflict) => `${conflict.path} → ${conflict.takenBy}`).join(", ");
  return `This chat has unsaved changes in folders it just handed to workers: ${list}${more}. Those changes were committed first, but stop editing them here or the merge will conflict.`;
}
