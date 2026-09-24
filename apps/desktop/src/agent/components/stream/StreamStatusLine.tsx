import { useState } from "react";
import { AsteriskIcon } from "lucide-react";
import type { ChatTurn } from "@/features/chat/hooks";
import { toolRunState } from "@/features/chat/components";
import { formatElapsed, formatTokens, useNow } from "@/agent/lib";

function activityOf(turn: Pick<ChatTurn, "tools" | "segments"> | null): string | null {
  if (turn?.tools.some((tool) => toolRunState(tool) === "running")) return null;
  if (turn?.segments?.at(-1)?.kind === "text") return "Writing…";
  return "Thinking…";
}

function tokensOf(turn: Pick<ChatTurn, "usage"> | null): number | null {
  const usage = turn?.usage;
  return usage?.totalTokens ?? usage?.outputTokens ?? null;
}

export function StreamStatusLine({ turn }: { readonly turn: ChatTurn | null }) {
  const [startedAt] = useState(() => Date.now());
  const now = useNow(true);
  const tokens = tokensOf(turn);
  const parts = [formatElapsed(now - startedAt), tokens === null ? null : `${formatTokens(tokens)} tokens`, activityOf(turn)];
  return (
    <div className="flex items-center gap-3 text-agent-text-faint text-sm" role="status" aria-live="polite">
      <AsteriskIcon className="size-5 shrink-0 text-agent-accent motion-safe:animate-spin motion-safe:[animation-duration:3s]" />
      <span className="truncate">{parts.filter((part) => part !== null).join(" · ")}</span>
    </div>
  );
}
