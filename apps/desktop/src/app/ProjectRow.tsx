import { useState } from "react";
import { ChevronDownIcon, SquarePenIcon } from "lucide-react";
import { basename } from "@/features/projects/lib";
import { DefaultProjectGlyphIcon } from "@/features/projects/ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui";
import { cn } from "@/shared/lib";
import type { ConversationMeta } from "@/features/chat/hooks";
import type { ProjectEntry } from "@/features/projects/hooks";
import { ProjectChatList } from "./ProjectChatList";
import { ProjectOptionsMenu } from "./ProjectOptionsMenu";

export interface ProjectRowProps {
  entry: ProjectEntry;
  active: boolean;
  isOnHome: boolean;
  chats: ConversationMeta[];
  activeSessionId: string | null;
  onSelectProject: (dir: string) => void;
  onSelectChat: (sessionId: string) => void;
  onNewChat: (dir: string) => void;
  onEditProject: (entry: ProjectEntry) => void;
  onArchiveProject: (entry: ProjectEntry) => void;
  onToggleHome: (dir: string) => void;
}

function projectLabel(entry: ProjectEntry): string {
  const rawLabel = entry.name || basename(entry.dir);
  return rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
}

export function ProjectRow(props: ProjectRowProps) {
  const { entry, active } = props;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const label = projectLabel(entry);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="group relative flex h-8 items-center gap-1 rounded-lg pl-1 pr-1 transition-colors duration-150 ease-out hover:bg-sidebar-hover focus-within:bg-sidebar-hover">
        <button
          type="button"
          onClick={() => setIsCollapsed((collapsed) => !collapsed)}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? `Expand ${label}` : `Collapse ${label}`}
          className="grid size-6 shrink-0 place-items-center rounded-md text-sidebar-text-tertiary"
        >
          <DefaultProjectGlyphIcon color={entry.tint} className="size-[18px] group-hover:hidden group-focus-within:hidden" />
          <ChevronDownIcon
            className={cn(
              "hidden size-4 transition-transform duration-150 group-hover:block group-focus-within:block",
              isCollapsed && "-rotate-90",
            )}
          />
        </button>
        <button
          type="button"
          onClick={() => props.onSelectProject(entry.dir)}
          className={cn(
            "min-w-0 flex-1 truncate text-left text-sm text-sidebar-text-primary",
            active && "font-medium",
          )}
        >
          {label}
        </button>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
          <ProjectOptionsMenu
            label={label}
            isOnHome={props.isOnHome}
            onToggleHome={() => props.onToggleHome(entry.dir)}
            onEdit={() => props.onEditProject(entry)}
            onArchive={() => props.onArchiveProject(entry)}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => props.onNewChat(entry.dir)}
                aria-label={`New chat in ${label}`}
                className="flex size-6 items-center justify-center rounded-md text-sidebar-text-tertiary transition-colors hover:bg-sidebar-hover hover:text-sidebar-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <SquarePenIcon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">New chat in project</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {!isCollapsed && (
        <ProjectChatList
          chats={props.chats}
          activeSessionId={props.activeSessionId}
          onOpenChat={(sessionId) => {
            if (!active) props.onSelectProject(entry.dir);
            props.onSelectChat(sessionId);
          }}
        />
      )}
    </div>
  );
}
