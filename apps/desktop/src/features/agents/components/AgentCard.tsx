import {
  CopyIcon,
  HomeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { cn } from "@/shared/lib";
import { AgentTileButton, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui";
import type { Agent } from "@/features/agents/hooks";
import { AgentAvatar } from "./AgentAvatar";

export function AgentCard({
  agent,
  onView,
  onChat,
  onEdit,
  onDuplicate,
  onDelete,
  onReset,
  onHome,
  onToggleHome,
}: {
  agent: Agent;
  onView: () => void;
  onChat: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Only for a built-in the user has changed — puts it back as it ships. */
  onReset?: () => void;
  /** Whether this agent is currently pinned on the Home canvas. */
  onHome: boolean;
  onToggleHome: () => void;
}) {
  return (
    <div className="group relative flex w-full flex-col gap-3 rounded-xl p-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg">
        <AgentAvatar
          name={agent.name}
          seed={agent.id}
          tint={agent.tint}
          icon={agent.icon}
          character={agent.character}
          size="lg"
          className="transition-transform duration-200 group-hover:scale-[1.02]"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
          <AgentTileButton
            size="sm"
            className="pointer-events-auto"
            onClick={onView}
          >
            View
          </AgentTileButton>
          <AgentTileButton
            size="sm"
            className="pointer-events-auto"
            onClick={onChat}
          >
            Chat
          </AgentTileButton>
        </div>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-sm text-foreground">
            {agent.name}
          </p>
          <p className="mt-1 line-clamp-3 max-w-[28ch] text-muted-foreground text-xs leading-relaxed">
            {agent.description || agent.instructions}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <AgentTileButton
              size="icon-xs"
              className={cn(
                "shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
                "focus-visible:opacity-100 data-[state=open]:opacity-100",
              )}
            >
              <MoreHorizontalIcon className="size-3.5" />
            </AgentTileButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <PencilIcon className="size-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <CopyIcon className="size-3.5" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onToggleHome}>
              <HomeIcon className="size-3.5" />
              {onHome ? "Remove from home" : "Add to home"}
            </DropdownMenuItem>
            {onReset && (
              <DropdownMenuItem onClick={onReset}>
                <RotateCcwIcon className="size-3.5" />
                Reset to default
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2Icon className="size-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
