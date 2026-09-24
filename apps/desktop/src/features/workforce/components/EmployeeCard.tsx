import { CopyIcon, HomeIcon, MoreHorizontalIcon, PencilIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/shared/lib";
import { AgentTileButton, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui";
import { AgentAvatar } from "@/features/agents/components";
import type { EmployeeView } from "../types";
import { SourceBadge } from "./SourceBadge";

export interface EmployeeActions {
  readonly onView: () => void;
  readonly onChat: () => void;
  readonly onEdit: () => void;
  readonly onDuplicate: () => void;
  readonly onTogglePin: () => void;
  readonly onRemove: (() => void) | null;
}

export function EmployeeCard({ employee, agentId, isPinned, isOverride, actions }: {
  readonly employee: EmployeeView;
  readonly agentId: string;
  readonly isPinned: boolean;
  readonly isOverride: boolean;
  readonly actions: EmployeeActions;
}) {
  const record = employee.performance;
  return (
    <div className="group relative flex w-full flex-col gap-3 rounded-xl p-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg">
        <AgentAvatar name={employee.name} seed={agentId} size="lg" className="transition-transform duration-200 group-hover:scale-[1.02]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center gap-2 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
          <AgentTileButton size="sm" className="pointer-events-auto" onClick={actions.onView}>View</AgentTileButton>
          <AgentTileButton size="sm" className="pointer-events-auto" onClick={actions.onChat}>Chat</AgentTileButton>
        </div>
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-foreground text-sm">{employee.name}</p>
            <SourceBadge source={employee.source} />
          </div>
          <p className="mt-1 line-clamp-2 max-w-[28ch] text-muted-foreground text-xs leading-relaxed">
            {employee.description || employee.responsibilities.join(", ")}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            {record ? `${record.ok}/${record.tasks} tasks ok` : "No tasks yet"} · {employee.memory.entries} memories
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <AgentTileButton size="icon-xs" aria-label={`More actions for ${employee.name}`} className={cn("shrink-0 opacity-0 transition-opacity group-hover:opacity-100", "focus-visible:opacity-100 data-[state=open]:opacity-100")}>
              <MoreHorizontalIcon className="size-3.5" />
            </AgentTileButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={actions.onEdit}>
              <PencilIcon className="size-3.5" />
              {employee.source === "project" ? "Edit" : "Customize for this project"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={actions.onDuplicate}>
              <CopyIcon className="size-3.5" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={actions.onTogglePin}>
              <HomeIcon className="size-3.5" />
              {isPinned ? "Remove from home" : "Add to home"}
            </DropdownMenuItem>
            {actions.onRemove && (
              <DropdownMenuItem variant={isOverride ? "default" : "destructive"} onClick={actions.onRemove}>
                {isOverride ? <RotateCcwIcon className="size-3.5" /> : <Trash2Icon className="size-3.5" />}
                {isOverride ? "Reset to built-in" : "Delete"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
