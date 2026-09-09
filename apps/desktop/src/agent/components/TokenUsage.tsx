import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { tokenReportingFor } from "@weave/agent/engines-registry.ts";
import type { AgentRunMeta } from "../normalize/types";
import { formatTokens } from "../lib/formatTokens";

/**
 * Token spend for one turn, rendered from whatever the engine actually
 * reported. ACP carries it on two independent, optional channels:
 *
 *   `usage_update`          → live context window (`used` / `size`), cost
 *   `PromptResponse.usage`  → session-cumulative input / output / thought /
 *                             cache totals (ACP counts these across turns,
 *                             not per turn — the labels say so)
 *
 * Claude Code and Codex send both; Amp sends only the turn totals; Antigravity
 * sends neither. So this picks the strongest available reading — a context bar
 * when there is a window, a plain total when there isn't — and says which
 * engine is silent rather than showing an empty gauge.
 */
export function TokenUsage({
  meta,
  engineId,
}: {
  meta: AgentRunMeta;
  engineId: string;
}) {
  const [open, setOpen] = useState(false);
  const usage = meta.usage;
  const reporting = tokenReportingFor(engineId);

  const used = usage?.used;
  const size = usage?.size;
  const percent =
    used != null && size != null && size > 0
      ? Math.min(100, Math.round((used / size) * 100))
      : null;

  // Session totals, in preference order: the reported total, else the sum.
  const summed =
    usage?.inputTokens != null || usage?.outputTokens != null
      ? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
      : undefined;
  const total = usage?.totalTokens ?? summed;

  const breakdown: Array<[string, number]> = [];
  if (usage?.inputTokens != null) breakdown.push(["Input", usage.inputTokens]);
  if (usage?.outputTokens != null) breakdown.push(["Output", usage.outputTokens]);
  if (usage?.thoughtTokens != null) breakdown.push(["Thinking", usage.thoughtTokens]);
  if (usage?.cachedReadTokens != null)
    breakdown.push(["Cache read", usage.cachedReadTokens]);
  if (usage?.cachedWriteTokens != null)
    breakdown.push(["Cache write", usage.cachedWriteTokens]);

  // Nothing reported. Say so only for engines that never report — a running
  // turn on a reporting engine simply hasn't sent its numbers yet.
  if (used == null && total == null) {
    if (reporting.contextWindow || reporting.turnTotals) return null;
    return (
      <span className="shrink-0 text-agent-text-faint text-xs">
        {meta.engineLabel} reports no token usage
      </span>
    );
  }

  const expandable = breakdown.length > 0 || usage?.costUsd != null;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={!expandable}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-3 rounded-lg px-2 py-1 transition-colors duration-150 ease-out",
          expandable && "hover:bg-agent-surface-hover",
        )}
      >
        <div className="flex flex-col items-end gap-1.5">
          <span className="flex items-center gap-1.5 whitespace-nowrap text-agent-text-muted text-xs">
            {used != null ? (
              <>
                {formatTokens(used)}
                {size ? ` / ${formatTokens(size)}` : ""} tokens
              </>
            ) : (
              <>{formatTokens(total!)} tokens used</>
            )}
            {expandable && (
              <ChevronDownIcon
                className={cn(
                  "size-3 opacity-60 transition-transform duration-150",
                  open && "rotate-180",
                )}
              />
            )}
          </span>
          {percent != null && (
            <span className="block h-1.5 w-40 overflow-hidden rounded-full bg-agent-surface-hover">
              <span
                className="block h-full rounded-full bg-agent-progress"
                style={{ width: `${percent}%` }}
              />
            </span>
          )}
        </div>
        {percent != null && (
          <span className="text-agent-text-bright text-sm tabular-nums">
            {percent}%
          </span>
        )}
      </button>

      {open && expandable && (
        <div className="absolute top-full right-0 z-20 mt-1 w-56 rounded-lg border border-agent-border bg-agent-surface-raised p-2 shadow-lg">
          {/* The context bar answers "how full"; this answers "spent on what". */}
          {total != null && (
            <Row label="Session total" value={formatTokens(total)} strong />
          )}
          {breakdown.map(([label, value]) => (
            <Row key={label} label={label} value={formatTokens(value)} />
          ))}
          {usage?.costUsd != null && (
            <Row label="Session cost" value={`$${usage.costUsd.toFixed(2)}`} />
          )}
          {breakdown.length === 0 && total == null && (
            <p className="px-1.5 py-1 text-agent-text-faint text-xs">
              No breakdown reported.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 px-1.5 py-1 text-xs">
      <span className="text-agent-text-faint">{label}</span>
      <span
        className={cn(
          "ml-auto font-mono tabular-nums",
          strong ? "text-agent-text-bright" : "text-agent-text",
        )}
      >
        {value}
      </span>
    </div>
  );
}
