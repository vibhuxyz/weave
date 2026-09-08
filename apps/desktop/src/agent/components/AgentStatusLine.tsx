import { useRef } from "react";
import { BerdLoaderInline } from "@/shared/ui/berd-loader-inline";
import { Shimmer } from "@/shared/ui/ai-elements/shimmer";
import { cn } from "@/shared/lib/cn";
import type { ChatTurn, ToolEntry } from "@/useAcpChat";
import { formatElapsed, useNow } from "../lib/elapsed";
import { formatTokens } from "../lib/formatTokens";
import { activeTitle, shorten } from "../lib/toolTitle";

/** Config keys different engines use for the reasoning-effort knob. */
const EFFORT_KEYS = ["effort", "reasoningEffort", "model_reasoning_effort"];

function isRunning(tool: ToolEntry) {
  return tool.status === "in_progress" || tool.status === "pending";
}

/** What the agent is doing right now, as a lowercase verb phrase. */
function activityLabel(turn: ChatTurn, projectDir: string | null): string {
  const tool = turn.tools.filter(isRunning).at(-1);
  if (tool) {
    if (tool.kind === "think") {
      return `exploring — ${shorten(tool.title, projectDir)}`;
    }
    return shorten(activeTitle(tool.title), projectDir).toLowerCase();
  }
  return turn.thought.trim().length > 0 ? "thinking" : "working";
}

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
  const activity = activityLabel(turn, projectDir ?? null);
  const detail = [
    elapsed,
    tokenLabel(turn.usage),
    effort ? `${activity} with ${effort} effort` : activity,
  ].filter(Boolean);

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
