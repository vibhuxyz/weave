import { ChevronDownIcon, SquarePenIcon } from "lucide-react";
import { basename } from "@/features/projects/lib";
import { DefaultProjectGlyphIcon } from "@/features/projects/ui";
import { CollapseReveal, ContextMenu, ContextMenuTrigger, Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui";
import { cn } from "@/shared/lib";
import type { ConversationMeta } from "@/features/chat/hooks";
import type { ProjectEntry } from "@/features/projects/hooks";
import { ProjectChatList } from "./ProjectChatList";
import { ProjectContextMenuContent, ProjectOptionsMenu, type ProjectMenuActions } from "./ProjectOptionsMenu";

export interface ProjectRowProps {
  entry: ProjectEntry;
  active: boolean;
  isExpanded: boolean;
  onToggleExpanded: (dir: string) => void;
  isOnHome: boolean;
  chats: ConversationMeta[];
  activeSessionId: string | null;
  onSelectProject: (dir: string) => void;
  onSelectChat: (sessionId: string, projectDir: string) => void;
  onArchiveChat: (chat: ConversationMeta, projectDir: string) => void;
  busySessionId: string | null;
  draftSessionId: string | null;
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
  const { entry, active, isExpanded, chats } = props;
  const label = projectLabel(entry);
  const canExpand = chats.length > 0 || active;
  const menuActions: ProjectMenuActions = {
    isOnHome: props.isOnHome,
    onToggleHome: () => props.onToggleHome(entry.dir),
    onEdit: () => props.onEditProject(entry),
    onArchive: () => props.onArchiveProject(entry),
  };
  const handleRowClick = () => {
    if (canExpand) props.onToggleExpanded(entry.dir);
    else props.onSelectProject(entry.dir);
  };

  return (
    <div className="flex flex-col">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="group relative flex h-8 items-center gap-1 rounded-lg pl-1 pr-1 transition-colors duration-150 ease-out hover:bg-sidebar-hover focus-within:bg-sidebar-hover has-[[data-state=open]]:bg-sidebar-hover">
            <button
              type="button"
              onClick={handleRowClick}
              aria-expanded={canExpand ? isExpanded : undefined}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-md text-sidebar-text-tertiary">
                <DefaultProjectGlyphIcon
                  color={entry.tint}
                  className={cn("size-[18px]", canExpand && "group-hover:hidden group-focus-within:hidden")}
                />
                {canExpand && (
                  <ChevronDownIcon
                    className={cn(
                      "hidden size-4 transition-transform duration-150 group-hover:block group-focus-within:block",
                      !isExpanded && "-rotate-90",
                    )}
                  />
                )}
              </span>
              <span className={cn("min-w-0 flex-1 truncate text-sm text-sidebar-text-primary", active && "font-medium")}>
                {label}
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
              <ProjectOptionsMenu label={label} {...menuActions} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onNewChat(entry.dir);
                    }}
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
        </ContextMenuTrigger>
        <ProjectContextMenuContent {...menuActions} />
      </ContextMenu>

      {canExpand && (
        <CollapseReveal open={isExpanded}>
          <ProjectChatList
            chats={chats}
            activeSessionId={props.activeSessionId}
            onOpenChat={(sessionId) => props.onSelectChat(sessionId, entry.dir)}
            onArchiveChat={(chat) => props.onArchiveChat(chat, entry.dir)}
            busySessionId={active ? props.busySessionId : null}
            draftSessionId={active ? props.draftSessionId : null}
          />
        </CollapseReveal>
      )}
    </div>
  );
}
