import { memo } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import type { EmployeeEntry } from "@/features/employees";
import type { Agent } from "@/features/agents/hooks";
import { menuActionsFor, type CardAction } from "@/features/agents/lib";
import { cn } from "@/shared/lib";
import { AgentTileButton } from "@/shared/ui";
import { AgentAvatar } from "../AgentAvatar";
import { ActionMenu } from "../employee-actions";
import { SourceBadge } from "./SourceBadge";

interface EmployeeCardProps {
  readonly agent: Agent;
  readonly entry: EmployeeEntry | undefined;
  readonly isPinned: boolean;
  readonly onAction: (action: CardAction, agentId: string) => void;
}

export const EmployeeCard = memo(function EmployeeCard({ agent, entry, isPinned, onAction }: EmployeeCardProps) {
  const performance = entry?.performance;
  return (
    <div className="group relative flex w-full flex-col gap-3 rounded-xl p-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg">
        <AgentAvatar
          name={agent.name}
          seed={agent.id}
          icon={agent.icon}
          character={agent.character}
          size="lg"
          className="transition-transform duration-200 group-hover:scale-[1.02]"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
          {entry && (
            <AgentTileButton size="sm" className="pointer-events-auto" onClick={() => onAction("view", agent.id)}>
              View
            </AgentTileButton>
          )}
          <AgentTileButton size="sm" className="pointer-events-auto" onClick={() => onAction("chat", agent.id)}>
            Chat
          </AgentTileButton>
        </div>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-sm text-foreground">{agent.name}</p>
            <SourceBadge agent={agent} entry={entry} />
          </div>
          <p className="mt-1 line-clamp-3 max-w-[28ch] text-muted-foreground text-xs leading-relaxed">
            {agent.description || agent.instructions}
          </p>
          {performance && (
            <p className="mt-1 text-muted-foreground text-xs">
              {performance.ok} of {performance.tasks} tasks succeeded
            </p>
          )}
        </div>
        <ActionMenu
          actions={menuActionsFor(agent, entry)}
          isPinned={isPinned}
          label={`More actions for ${agent.name}`}
          onAction={(action) => onAction(action, agent.id)}
          trigger={(props) => (
            <AgentTileButton
              {...props}
              size="icon-xs"
              className={cn(
                "shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
                "focus-visible:opacity-100 data-[state=open]:opacity-100",
              )}
            >
              <MoreHorizontalIcon className="size-3.5" />
            </AgentTileButton>
          )}
        />
      </div>
    </div>
  );
});
