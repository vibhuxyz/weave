import { memo, useState } from "react";
import type { ChatTurn, ToolEntry } from "@/features/chat/hooks";
import { cleanOutput, toolRunState } from "@/features/chat/components";
import { Shimmer } from "@/shared/ui/ai-elements";
import { MAX_OUTPUT_CHARS } from "./constants";
import { DiffStat } from "./DiffStat";
import { DisclosureHeader } from "../DisclosureHeader";
import { diffTotalsOf } from "./tool-diff";
import { actionOf, commandOf, rowSubject, rowVerb } from "./tool-label";

function outputOf(tool: ToolEntry): string {
  const cleaned = tool.output ? cleanOutput(tool.output) : "";
  return cleaned.length <= MAX_OUTPUT_CHARS ? cleaned : `${cleaned.slice(0, MAX_OUTPUT_CHARS)}\n… (output truncated)`;
}

function ToolRowView({ tool, turn, onOpenDiff }: { readonly tool: ToolEntry; readonly turn: ChatTurn; readonly onOpenDiff?: (path?: string) => void }) {
  const [open, setOpen] = useState(false);
  const isRunning = toolRunState(tool) === "running";
  const isFailed = toolRunState(tool) === "failed";
  const isShell = actionOf(tool) === "ran";
  const output = outputOf(tool);
  const totals = diffTotalsOf(turn, [tool]);
  const diffPath = tool.diffs?.[0]?.path;
  const label = (
    <>
      {rowVerb(tool, false)} <span className="text-agent-text">{rowSubject(tool)}</span>
      {isFailed && <span className="text-agent-critical-fg"> (failed)</span>}
      <DiffStat additions={totals.additions} deletions={totals.deletions} />
    </>
  );
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <DisclosureHeader open={open} onToggle={() => setOpen((value) => !value)}>
        {isRunning ? <Shimmer>{`${rowVerb(tool, isRunning)} ${rowSubject(tool)}…`}</Shimmer> : label}
      </DisclosureHeader>
      {open && isShell && (
        <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded-lg bg-agent-code-bg px-3 py-2 font-mono text-agent-text text-xs">$ {commandOf(tool)}</pre>
      )}
      {open && output && (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-agent-text-muted text-xs">{output}</pre>
      )}
      {open && diffPath && onOpenDiff && (
        <button type="button" onClick={() => onOpenDiff(diffPath)} className="self-start text-agent-accent text-xs hover:underline">
          Open diff
        </button>
      )}
    </li>
  );
}

export const ToolRow = memo(ToolRowView);
