import { SparklesIcon } from "lucide-react";
import type { AgentRunMeta } from "../normalize/types";
import { TokenUsage } from "./TokenUsage";

export type DepthLevel = "brief" | "normal" | "deep";

/**
 * The run card's identity row. It carries only what is immediately useful —
 * who is running, on which model, and how much of the context window is gone.
 * File counts, the read-only badge, copy, and the depth switch were pulled out
 * of this row: counts belong to the inspector, copy belongs to the surface
 * that actually holds copyable content.
 */
export function AgentHeader({
  meta,
  engineId,
}: {
  meta: AgentRunMeta;
  /** Which engine ran this turn — decides how token usage is explained. */
  engineId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-agent-border border-b bg-agent-surface-raised px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-agent-accent text-agent-accent-fg">
          <SparklesIcon className="size-4" />
        </span>
        <span className="shrink-0 font-medium text-sm">{meta.engineLabel}</span>
        {meta.model && (
          <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-agent-chip-border bg-agent-chip-bg px-2.5 py-1 text-agent-text-muted text-xs">
            <SparklesIcon className="size-3 shrink-0 text-agent-progress-fg" />
            <span className="truncate">{meta.model}</span>
          </span>
        )}
      </div>

      <TokenUsage meta={meta} engineId={engineId} />
    </div>
  );
}
