import { Button, Progress } from "@/shared/ui";
import { formatCompactTokenCount } from "../lib";
import type { ContextUsage } from "../lib";

interface ContextUsagePanelProps {
  readonly usage: ContextUsage | null;
  readonly percent: number;
  readonly emptyMessage: string;
  readonly compaction: {
    readonly hint: string;
    readonly canCompact: boolean;
    readonly isCompacting: boolean;
    readonly onCompact: () => void;
  } | null;
}

export function ContextUsagePanel({ usage, percent, emptyMessage, compaction }: ContextUsagePanelProps) {
  return (
    <>
      <p className="text-base font-semibold text-foreground">Context window</p>
      <Progress className="mt-3 h-1.5 bg-foreground/15" value={percent} aria-label={`Context window ${percent}% used`} />
      {usage ? (
        <div className="mt-2 flex items-center justify-between gap-3 text-sm text-foreground">
          <span className="truncate tabular-nums">
            {formatCompactTokenCount(usage.contextTokens)} / {formatCompactTokenCount(usage.contextLimit)} tokens used
          </span>
          <span className="shrink-0 tabular-nums">{percent}%</span>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>
      )}
      {compaction && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">{compaction.hint}</span>
          <Button
            type="button"
            variant="subtle"
            size="xs"
            onClick={compaction.onCompact}
            disabled={!compaction.canCompact || compaction.isCompacting}
          >
            {compaction.isCompacting ? "Compacting…" : "Compact now"}
          </Button>
        </div>
      )}
    </>
  );
}
