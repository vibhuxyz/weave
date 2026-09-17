import { basename } from "@/features/projects/lib";
import { DefaultProjectGlyphIcon } from "@/features/projects/ui";
import { cn } from "@/shared/lib";
import type { ConversationMeta } from "@/features/chat/hooks";
import type { ProjectEntry } from "@/features/projects/hooks";
import { ChatRow } from "./ChatRow";
import { ProjectOptionsMenu } from "./ProjectOptionsMenu";

export interface ProjectRowProps {
  entry: ProjectEntry;
  active: boolean;
  chats: ConversationMeta[];
  activeSessionId: string | null;
  onSelectProject: (dir: string) => void;
  onSelectChat: (sessionId: string) => void;
  onNewChat?: () => void;
  onEditProject?: (entry: ProjectEntry) => void;
  onRemoveProject?: (dir: string) => void;
}

export function ProjectRow({
  entry,
  active,
  chats,
  activeSessionId,
  onSelectProject,
  onSelectChat,
  onEditProject,
  onRemoveProject,
}: ProjectRowProps) {
  const rawLabel = entry.name || basename(entry.dir);
  const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="group relative flex h-8 items-center rounded-lg px-2 transition-colors duration-150 ease-out hover:bg-sidebar-hover">
        <button
          type="button"
          onClick={() => onSelectProject(entry.dir)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <DefaultProjectGlyphIcon
            color={entry.tint}
            className="size-[18px] shrink-0"
          />
          <span
            className={cn(
              "truncate text-sm transition-colors duration-150 ease-out",
              active
                ? "font-medium text-sidebar-text-primary"
                : "text-sidebar-text-primary group-hover:text-sidebar-text-primary",
            )}
          >
            {label}
          </span>
        </button>

        {onEditProject && onRemoveProject && (
          <div className="shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <ProjectOptionsMenu
              label={label}
              onEdit={() => onEditProject(entry)}
              onRemove={() => onRemoveProject(entry.dir)}
            />
          </div>
        )}
      </div>

      {chats.length > 0 && (
        <div className="flex flex-col gap-0.5 pl-6 pr-1">
          {chats.map((chat) => (
            <ChatRow
              key={chat.id}
              title={chat.title || "New chat"}
              updatedAt={chat.updatedAt}
              active={chat.id === activeSessionId}
              onClick={() => {
                if (!active) {
                  onSelectProject(entry.dir);
                }
                onSelectChat(chat.id);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
