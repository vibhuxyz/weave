import { cn } from "@/shared/lib/cn";
import { Shimmer } from "@/shared/ui/ai-elements/shimmer";
import type { ChatTurn, ToolEntry } from "../../useAcpChat";
import { activeTitle, shorten } from "../lib/toolTitle";

function isRunning(tool: ToolEntry) {
  return tool.status === "in_progress" || tool.status === "pending";
}

/**
 * What the agent is doing right now, named as an operation rather than as
 * model-internal reasoning: "Editing src/server.ts", not "I think the user…".
 * Sits inside the run card, directly under the identity row.
 */
export function WorkingRow({
  turn,
  projectDir,
}: {
  turn: ChatTurn;
  projectDir?: string | null;
}) {
  const tool = turn.tools.filter(isRunning).at(-1);
  const activity = tool
    ? tool.kind === "think"
      ? `Exploring — ${shorten(tool.title, projectDir ?? null)}`
      : shorten(activeTitle(tool.title), projectDir ?? null)
    : turn.thought.trim().length > 0
      ? "Planning the next step"
      : "Working";

  return (
    <div className="flex items-center gap-2.5 border-agent-border border-b bg-agent-surface-raised px-4 py-2.5">
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-agent-running opacity-60" />
        <span className={cn("relative inline-flex size-2 rounded-full bg-agent-running")} />
      </span>
      <span className="shrink-0 font-medium text-agent-text-bright text-xs">
        Working
      </span>
      <Shimmer className="min-w-0 flex-1 truncate text-agent-text-muted text-xs">
        {activity}
      </Shimmer>
    </div>
  );
}
