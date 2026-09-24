import { useState } from "react";
import { AsteriskIcon } from "lucide-react";
import type { ChatTurn } from "@/features/chat/hooks";
import { toolRunState } from "@/features/chat/components";
import { formatElapsed, formatTokens, useNow } from "@/agent/lib";

function activityOf(turn: Pick<ChatTurn, "segments"> | null, runningCount: number): string {
  if (runningCount > 0) return "Running tools…";
  if (turn?.segments?.at(-1)?.kind === "text") return "Writing…";
  return "Thinking…";
}

function tokensOf(turn: Pick<ChatTurn, "usage"> | null): number | null {
  const usage = turn?.usage;
  return usage?.totalTokens ?? usage?.outputTokens ?? null;
}

export function StreamStatusLine({ turn, onOpenTasks }: { readonly turn: ChatTurn | null; readonly onOpenTasks?: () => void }) {
  const [startedAt] = useState(() => Date.now());
  const now = useNow(true);
  const tokens = tokensOf(turn);
  const runningCount = turn?.tools.filter((tool) => toolRunState(tool) === "running").length ?? 0;
  return (
    <div className="flex items-center gap-3 text-agent-text-faint text-sm" role="status" aria-live="polite">
      <AsteriskIcon className="size-5 shrink-0 text-agent-accent motion-safe:animate-spin motion-safe:[animation-duration:3s]" />
      <span className="flex min-w-0 items-center gap-1.5 truncate">
        <span>{formatElapsed(now - startedAt)}</span>
        {tokens !== null && <span>· {formatTokens(tokens)} tokens</span>}
        {runningCount > 0 && (
          <>
            <span>·</span>
            <button type="button" onClick={onOpenTasks} className="underline-offset-2 hover:text-agent-text hover:underline">
              {runningCount} running task{runningCount === 1 ? "" : "s"}
            </button>
          </>
        )}
        <span>· {activityOf(turn, runningCount)}</span>
      </span>
    </div>
  );
}
