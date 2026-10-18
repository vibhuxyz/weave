import { ChevronDownIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui";
import type { Commit, DiffSource, RefsState } from "../../types";
import { CompareMenu } from "./CompareMenu";

function label(source: DiffSource, refs: RefsState | null): string {
  if (source.kind === "commit") return source.sha.slice(0, 7);
  if (source.kind === "range") return `${source.from}..${source.to}`;
  return refs?.branch ?? "working tree";
}

export function BranchPill({
  refs,
  commits,
  source,
  onPickSource,
}: {
  readonly refs: RefsState | null;
  readonly commits: readonly Commit[];
  readonly source: DiffSource;
  readonly onPickSource: (source: DiffSource) => void;
}) {
  const base = source.kind === "working" ? source.base : refs?.defaultBranch;
  return (
    <Popover>
      <PopoverTrigger className="flex min-w-0 items-center gap-2 rounded-lg bg-agent-surface-hover px-3 py-1.5 text-[13px] text-agent-text-bright">
        {base && (
          <>
            <span className="shrink-0 text-agent-text-muted">{base}</span>
            <span className="shrink-0 text-agent-text-faint">&rarr;</span>
          </>
        )}
        <span className="truncate">{label(source, refs)}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-agent-text-faint" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto border-diff-menu-border bg-diff-menu-bg p-0">
        <CompareMenu refs={refs} commits={commits} source={source} onPickSource={onPickSource} />
      </PopoverContent>
    </Popover>
  );
}
