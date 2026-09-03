import { CopyIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/cn";
import type { AgentRunMeta } from "../normalize/types";
import { deriveStatusPill } from "../normalize/runMeta";

export type DepthLevel = "brief" | "normal" | "deep";

function formatDuration(ms?: number): string | null {
  if (!ms) return null;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function AgentHeader({
  meta,
  onCopy,
  depth = "normal",
  onDepthChange,
  showDepth = true,
}: {
  meta: AgentRunMeta;
  onCopy?: () => void;
  depth?: DepthLevel;
  onDepthChange?: (depth: DepthLevel) => void;
  showDepth?: boolean;
}) {
  const details = [
    meta.model,
    formatDuration(meta.durationMs),
    meta.usage?.used ? `${(meta.usage.used / 1000).toFixed(1)}k tokens` : null,
    meta.usage?.costUsd ? `$${meta.usage.costUsd.toFixed(2)}` : null,
  ].filter(Boolean);
  const pill = deriveStatusPill(meta);

  return (
    <div className="flex items-center justify-between gap-3 border-agent-border border-b bg-agent-surface-raised px-5 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-agent-accent text-agent-accent-fg">
          <SparklesIcon className="size-3.5" />
        </span>
        <span className="shrink-0 font-medium text-sm">{meta.engineLabel}</span>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px]",
            pill.tone === "problem"
              ? "border-agent-critical/40 bg-agent-critical-bg text-agent-critical-fg"
              : "border-agent-border bg-agent-surface-inset text-agent-text-muted",
          )}
        >
          {pill.label}
        </span>
        {details.length > 0 && (
          <Badge
            variant="secondary"
            className="min-w-0 max-w-[22rem] truncate border-agent-chip-border bg-agent-chip-bg font-mono text-agent-text-muted"
          >
            {details.join(" · ")}
          </Badge>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {showDepth && (
        <div className="hidden rounded-md border border-agent-border bg-agent-surface-sunken p-0.5 text-xs sm:flex">
          {(["Brief", "Normal", "Deep"] as const).map((label) => {
            const value = label.toLowerCase() as DepthLevel;
            const isActive = depth === value;
            return (
              <span
                key={label}
                role="button"
                tabIndex={0}
                onClick={() => onDepthChange?.(value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onDepthChange?.(value);
                  }
                }}
                className={
                  isActive
                    ? "cursor-pointer rounded-sm bg-agent-surface-hover px-2.5 py-1 text-agent-text-bright"
                    : "cursor-pointer px-2.5 py-1 text-agent-text-faint hover:text-agent-text-bright/70 transition-colors"
                }
              >
                {label}
              </span>
            );
          })}
        </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onCopy}
          leftIcon={<CopyIcon />}
        >
          copy
        </Button>
      </div>
    </div>
  );
}
