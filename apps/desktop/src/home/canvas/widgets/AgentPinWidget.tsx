import { memo } from "react";
import { cn } from "@/shared/lib/cn";
import { AgentAvatar } from "@/agents/AgentAvatar";
import { useAgents } from "@/useAgents";
import { useWidgetActivationGuard } from "./useWidgetActivationGuard";
import type { WidgetRenderProps } from "./types";

/**
 * Adapted from upstream `AgentPinWidget`. Upstream reads a persona from
 * `agentStore` + a CDN avatar; Berd resolves the agent from `useAgents` and
 * renders its `AgentAvatar`. Click starts a chat with the agent (routed
 * through `onOpenAgent`, wired to Berd's `handleChatWithAgent`).
 */
function agentIdOf(state: Record<string, unknown> | undefined): string | null {
  return typeof state?.agentId === "string" ? state.agentId : null;
}

export const AgentPinWidget = memo(function AgentPinWidget({
  instance,
  shouldIgnoreActivation,
  onOpenAgent,
  onTagAgentInComposer,
}: WidgetRenderProps) {
  const { agents } = useAgents();

  const agentId = agentIdOf(instance.state);
  const agent =
    agents.find((a) => a.id === agentId) ??
    agents.find((a) => a.builtin) ??
    agents[0];
  const label = agent?.name ?? "Agent";
  const resolvedId = agent?.id ?? agentId ?? "agent";

  const handleClick = useWidgetActivationGuard(shouldIgnoreActivation, () =>
    (onTagAgentInComposer ?? onOpenAgent)?.(resolvedId),
  );

  return (
    <div className="group pointer-events-none relative flex h-full w-full items-center justify-center text-center text-foreground">
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Chat with ${label}`}
        className="pointer-events-auto relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-full bg-transparent outline-none transition-colors duration-150 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AgentAvatar
          name={label}
          seed={resolvedId}
          tint={agent?.tint}
          icon={agent?.icon}
          size="lg"
          className="pointer-events-none h-full w-full"
        />
      </button>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute bottom-1 left-1/2 z-10 max-w-[calc(100%-1.5rem)] -translate-x-1/2 translate-y-2 truncate whitespace-nowrap rounded-full bg-card/90 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur-md opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        {label}
      </span>
    </div>
  );
});
