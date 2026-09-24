import type { PlanItem } from "@/features/chat/hooks";

export interface PlanProgress {
  readonly done: number;
  readonly total: number;
}

export function planProgressOf(entries: readonly PlanItem[]): PlanProgress | null {
  if (entries.length === 0) return null;
  return { done: entries.filter((entry) => entry.status === "completed").length, total: entries.length };
}

export function planSignatureOf(entries: readonly PlanItem[]): string {
  return entries.map((entry) => entry.content).join("\n");
}
