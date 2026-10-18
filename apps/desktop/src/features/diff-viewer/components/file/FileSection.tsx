import { memo, useMemo } from "react";
import type { FileDiff } from "@/agent/diff";
import { useCopyToClipboard } from "@/shared/hooks";
import { cn } from "@/shared/lib";
import { ROW_HEIGHT_PX } from "../../constants";
import type { DiffChannel } from "../../api";
import { useHunkContext, useLineTokens } from "../../hooks";
import { toPatch, withWordSegments } from "../../model";
import type { DiffSource, FileStat } from "../../types";
import { FileRows } from "./FileRows";
import { buildRows } from "./file-rows";
import { FileSectionHeader } from "./FileSectionHeader";

export const FileSection = memo(function FileSection({
  stat,
  file,
  source,
  channel,
  isOpen,
  isLoading,
  isMissing,
  isSelected,
  onToggle,
  registerRef,
}: {
  readonly stat: FileStat;
  readonly file: FileDiff | undefined;
  readonly source: DiffSource;
  readonly channel: DiffChannel;
  readonly isOpen: boolean;
  readonly isLoading: boolean;
  readonly isMissing: boolean;
  readonly isSelected: boolean;
  readonly onToggle: () => void;
  readonly registerRef: (element: HTMLElement | null) => void;
}) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const prepared = useMemo(() => (file ? withWordSegments(file) : undefined), [file]);
  const hunks = prepared?.hunks ?? [];
  const lines = useMemo(() => hunks.flatMap((hunk) => hunk.lines), [hunks]);
  const tokens = useLineTokens(stat.path, lines, isOpen);
  const { gapFor, expand } = useHunkContext(stat.path, hunks, source, channel);

  const rows = useMemo(() => buildRows(hunks, gapFor), [gapFor, hunks]);

  return (
    <section
      ref={registerRef}
      className={cn(
        "shrink-0 overflow-hidden rounded-lg border bg-agent-code-bg",
        isSelected ? "border-agent-accent/50" : "border-agent-code-border",
      )}
      style={{ contentVisibility: "auto", containIntrinsicSize: `auto ${String(Math.max(lines.length, 1) * ROW_HEIGHT_PX)}px` }}
    >
      <FileSectionHeader
        name={stat.name}
        dir={stat.dir}
        oldPath={stat.oldPath}
        additions={stat.additions}
        deletions={stat.deletions}
        isOpen={isOpen}
        onToggle={onToggle}
        onCopy={() => prepared && copyToClipboard(toPatch(prepared))}
        isCopied={isCopied}
      />
      {isOpen && isLoading && <p className="px-2.5 py-2 text-[11px] text-agent-text-faint">Loading the diff&hellip;</p>}
      {isOpen && isMissing && !prepared && (
        <p className="px-2.5 py-2 text-[11px] text-agent-text-faint">
          This file&apos;s diff was too large to load. Its line counts are shown above.
        </p>
      )}
      {isOpen && prepared && (
        <div>
          {prepared.truncated && (
            <p className="px-2.5 py-1 text-[10px] text-agent-text-faint">
              Large file &mdash; only the first part of the diff is shown.
            </p>
          )}
          <FileRows rows={rows} tokens={tokens} onExpand={expand} />
        </div>
      )}
    </section>
  );
});
