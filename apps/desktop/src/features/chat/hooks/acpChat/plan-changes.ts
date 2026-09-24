import type { ChatTurn, PlanChangeKind, PlanItem, ToolEntry } from "./types";

export interface PlanChange {
  readonly kind: PlanChangeKind;
  readonly content: string;
}

export function latestPlanEntries(turns: readonly ChatTurn[]): readonly PlanItem[] {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const entries = turns[index]?.plan?.entries;
    if (entries && entries.length > 0) return entries;
  }
  return [];
}

export function planChanges(previous: readonly PlanItem[], next: readonly PlanItem[]): readonly PlanChange[] {
  const before = new Map(previous.map((item) => [item.content, item.status ?? "pending"]));
  return next.flatMap((item): PlanChange[] => {
    const status = item.status ?? "pending";
    const was = before.get(item.content);
    if (was === undefined) return status === "completed" ? [{ kind: "added", content: item.content }, { kind: "completed", content: item.content }] : [{ kind: "added", content: item.content }];
    if (was === status) return [];
    if (status === "in_progress") return [{ kind: "started", content: item.content }];
    if (status === "completed") return [{ kind: "completed", content: item.content }];
    return [];
  });
}

export function planChangeEntries(turnId: string, firstIndex: number, changes: readonly PlanChange[], at: number | undefined): readonly ToolEntry[] {
  return changes.map((change, offset) => ({
    id: `plan:${turnId}:${firstIndex + offset}`,
    title: change.content,
    status: "completed",
    kind: "other",
    planChange: change.kind,
    startedAt: at,
    endedAt: at,
  }));
}
