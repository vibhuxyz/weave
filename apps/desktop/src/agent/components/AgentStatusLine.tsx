import { useRef } from "react";
import { BerdLoaderInline } from "@/shared/ui";
import { Shimmer } from "@/shared/ui/ai-elements";
import { cn } from "@/shared/lib";
import type { ChatTurn } from '@/features/chat/hooks';
import { formatElapsed, useNow, formatTokens, currentActivity } from "@/agent/lib";
/** Config keys different engines use for the reasoning-effort knob. */
const EFFORT_KEYS = ["effort", "reasoningEffort", "model_reasoning_effort"];

function tokenLabel(usage: ChatTurn["usage"]): string | null {
  if (!usage) return null;
  if (usage.outputTokens != null) {
    return `↓ ${formatTokens(usage.outputTokens)} tokens`;
  }
  if (usage.contextUsed != null) {
    return `${formatTokens(usage.contextUsed)} ctx`;
  }
  return null;
}

/**
 * The one-line "what's happening" summary shown while a turn runs:
 * `Working…  (21s · ↓ 717 tokens · reading paths.ts with medium effort)`.
 *
 * Token counts are per-turn / running totals — no engine reports tokens per
 * tool call. Renders nothing once the turn ends; `AgentHeader` owns the totals.
 */
export function AgentStatusLine({
  turn,
  running,
  configValues,
  projectDir,
}: {
  turn: ChatTurn;
  running: boolean;
  configValues: Record<string, string>;
  projectDir?: string | null;
}) {
  const startedAt = useRef(Date.now());
  const now = useNow(running);

  if (!running) return null;

  const elapsed = formatElapsed(now - startedAt.current);
  const effort = EFFORT_KEYS.map((k) => configValues[k]).find(Boolean);
  // The row already says "Working…", so a generic activity would only repeat it.
  const activity = currentActivity(turn, projectDir ?? null)?.toLowerCase() ?? null;
  const work = [activity, effort ? `${effort} effort` : null].filter(Boolean).join(" with ");
  const detail = [elapsed, tokenLabel(turn.usage), work || null].filter(Boolean);

  return (
    <div className="dark flex items-center gap-2 px-1 text-agent-text-faint">
      <BerdLoaderInline size={14} animated decorative />
      <Shimmer className="shrink-0 text-sm">Working…</Shimmer>
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-[11px] tabular-nums",
        )}
      >
        ({detail.join(" · ")})
      </span>
    </div>
  );
}
