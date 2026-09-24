import { useState } from "react";
import type { ChatTurn, ToolEntry } from "@/features/chat/hooks";
import { toolRunState } from "@/features/chat/components";
import { Shimmer } from "@/shared/ui/ai-elements";
import { MAX_ROWS_PER_GROUP } from "./constants";
import { DiffStat } from "./DiffStat";
import { DisclosureHeader } from "../DisclosureHeader";
import { diffTotalsOf } from "./tool-diff";
import { groupLabel, rowSubject, rowVerb } from "./tool-label";
import { ToolRow } from "./ToolRow";

export function ToolGroup({
  tools,
  turn,
  onOpenDiff,
}: {
  readonly tools: readonly ToolEntry[];
  readonly turn: ChatTurn;
  readonly onOpenDiff?: (path?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const running = tools.find((tool) => toolRunState(tool) === "running");
  const totals = diffTotalsOf(turn, tools);
  const visible = tools.slice(-MAX_ROWS_PER_GROUP);
  const hiddenCount = tools.length - visible.length;
  return (
    <div className="flex flex-col gap-2">
      <DisclosureHeader open={open} onToggle={() => setOpen((value) => !value)}>
        {running ? (
          <Shimmer>{`${rowVerb(running, true)} ${rowSubject(running)}…`}</Shimmer>
        ) : (
          <>
            {groupLabel(tools)}
            <DiffStat additions={totals.additions} deletions={totals.deletions} />
          </>
        )}
      </DisclosureHeader>
      {open && (
        <ul className="divide-y divide-agent-border overflow-hidden rounded-xl border border-agent-border">
          {hiddenCount > 0 && <li className="px-4 py-2 text-agent-text-faint text-xs">({hiddenCount} earlier steps hidden)</li>}
          {visible.map((tool) => (
            <ToolRow key={tool.id} tool={tool} turn={turn} onOpenDiff={onOpenDiff} />
          ))}
        </ul>
      )}
    </div>
  );
}
