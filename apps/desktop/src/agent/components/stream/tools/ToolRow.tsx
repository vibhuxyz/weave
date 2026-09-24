import { memo, useState } from "react";
import type { ChatTurn, ToolEntry } from "@/features/chat/hooks";
import { cleanOutput, toolRunState } from "@/features/chat/components";
import { cn } from "@/shared/lib";
import { Shimmer } from "@/shared/ui/ai-elements";
import { CommandLine } from "./CommandLine";
import { CODE_BLOCK_CLASS, MAX_OUTPUT_CHARS } from "./constants";
import { DiffPreview } from "./DiffPreview";
import { DiffStat } from "./DiffStat";
import { DisclosureHeader } from "../DisclosureHeader";
import { diffTotalsOf } from "./tool-diff";
import { actionOf, commandOf, rowSubject, rowVerb, runningLabel } from "./tool-label";

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
      {rowVerb(tool, false)} {rowSubject(tool)}
      {isFailed && <span className="text-agent-critical-fg"> (failed)</span>}
      <DiffStat additions={totals.additions} deletions={totals.deletions} />
    </>
  );
  return (
    <li className="flex flex-col gap-2 px-3 py-2">
      <DisclosureHeader open={open} onToggle={() => setOpen((value) => !value)}>
        {isRunning ? <Shimmer>{runningLabel(tool)}</Shimmer> : label}
      </DisclosureHeader>
      {open && isShell && (
        <CommandLine command={commandOf(tool)} className="max-h-80" />
      )}
      {open && tool.diffs?.map((diff, index) => <DiffPreview key={`${index}:${diff.path}`} diff={diff} />)}
      {open && output && (
        <pre className={cn(CODE_BLOCK_CLASS, "max-h-80 text-agent-text-muted")}>{output}</pre>
      )}
      {open && tool.planChange && <p className="whitespace-pre-wrap text-agent-text-muted text-sm">{tool.title}</p>}
      {open && diffPath && onOpenDiff && (
        <button type="button" onClick={() => onOpenDiff(diffPath)} className="self-start text-agent-text-muted text-xs transition-colors hover:text-agent-text-bright">
          Open diff
        </button>
      )}
    </li>
  );
}

export const ToolRow = memo(ToolRowView);
