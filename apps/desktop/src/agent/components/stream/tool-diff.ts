import type { ChatTurn, ToolEntry } from "@/features/chat/hooks";
import { turnDiff } from "@/agent/diff";

export interface DiffTotals {
  readonly additions: number;
  readonly deletions: number;
}

export function diffTotalsOf(turn: ChatTurn, tools: readonly ToolEntry[]): DiffTotals {
  if (!tools.some((tool) => (tool.diffs?.length ?? 0) > 0)) return { additions: 0, deletions: 0 };
  const { additions, deletions } = turnDiff({ ...turn, tools: [...tools] });
  return { additions, deletions };
}
