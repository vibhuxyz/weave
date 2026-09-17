import {
  BookOpenIcon,
  BotIcon,
  HomeIcon,
  PlusIcon,
  SettingsIcon,
  SquarePenIcon,
} from "lucide-react";
import { DefaultProjectGlyphIcon } from "@/features/projects/ui";
import { cn } from "@/shared/lib";
import type { ConversationMeta } from "@/features/chat/hooks";
import type { ProjectEntry } from "@/features/projects/hooks";
import { ChatRow } from "./ChatRow";
import { ProjectRow } from "./ProjectRow";

export type SidebarView = "home" | "chat" | "agents" | "plugins" | "skills" | "settings";

export interface SidebarProps {
  projects: ProjectEntry[];
  activeProjectDir: string | undefined;
  onSelectProject: (dir: string) => void;
  onAddProject: () => void;
  onEditProject: (entry: ProjectEntry) => void;
  onRemoveProject: (dir: string) => void;
  chats: ConversationMeta[];
  chatsByProject?: Record<string, ConversationMeta[]>;
  nonProjectChats?: ConversationMeta[];
  activeSessionId: string | null;
  onSelectChat: (sessionId: string) => void;
  onNewChat: () => void;
  onOpenSettings?: () => void;
  view: SidebarView;
  onViewChange: (view: SidebarView) => void;
}

const NAV = [
  { id: "home", label: "Home", icon: HomeIcon, view: "home" as const },
  { id: "agents", label: "Agents", icon: BotIcon, view: "agents" as const },
  { id: "skills", label: "Skills", icon: BookOpenIcon, view: "skills" as const },
] as const;

function SectionLabel({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="group/section flex items-center justify-between px-2.5 pt-4 pb-1.5">
      <p className="text-[13px] font-medium text-sidebar-text-secondary">{children}</p>
      {action}
    </div>
  );
}

function SectionAction({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-6 items-center justify-center rounded-full text-sidebar-text-tertiary opacity-0 transition-all duration-150 ease-out group-hover/section:opacity-100 hover:bg-sidebar-hover hover:text-sidebar-text-primary"
    >
      <PlusIcon className="size-[16px]" />
    </button>
  );
}

function findChatsForProject(
  entry: ProjectEntry,
  chatsByProject: Record<string, ConversationMeta[]> | undefined,
  activeProjectDir: string | undefined,
  currentChats: ConversationMeta[],
): ConversationMeta[] {
  if (!chatsByProject) {
    return entry.dir === activeProjectDir ? currentChats : [];
  }
  const byDir = chatsByProject[entry.dir];
  if (byDir) return byDir;
  if (entry.name) {
    const byName = chatsByProject[entry.name];
    if (byName) return byName;
  }

  const lowerDir = entry.dir.toLowerCase();
  const lowerName = entry.name ? entry.name.toLowerCase() : "";

  const matchedKey = Object.keys(chatsByProject).find((k) => {
    const lowerKey = k.toLowerCase();
    return (
      lowerKey === lowerDir ||
      (lowerName.length > 0 && lowerKey === lowerName) ||
      lowerDir.endsWith(`/${lowerKey}`) ||
      (lowerName.length > 0 && lowerKey.endsWith(`/${lowerName}`))
    );
  });

  if (matchedKey) {
    const matchedChats = chatsByProject[matchedKey];
    if (matchedChats) return matchedChats;
  }

  return entry.dir === activeProjectDir ? currentChats : [];
}

export function Sidebar({
  projects,
  activeProjectDir,
  onSelectProject,
  onAddProject,
  onEditProject,
  onRemoveProject,
  chats,
  chatsByProject,
  nonProjectChats,
  activeSessionId,
  onSelectChat,
  onNewChat,
  onOpenSettings,
  view,
  onViewChange,
}: SidebarProps) {
  const standaloneChats = nonProjectChats || (chatsByProject && chatsByProject[""]) || [];

  return (
    <aside className="flex h-fit min-h-[710px] max-h-[calc(100vh-2.5rem)] w-full shrink-0 flex-col overflow-hidden rounded-[14px] border border-sidebar-shell-border bg-sidebar-shell p-3 shadow-[var(--sidebar-shell-shadow)]">
      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ id, label, icon: Icon, view: navView }) => {
          const active = navView === view;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onViewChange(navView)}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors duration-150 ease-out",
                active
                  ? "bg-sidebar-selected text-sidebar-text-primary font-medium"
                  : "text-sidebar-text-secondary hover:bg-sidebar-hover hover:text-sidebar-text-primary",
              )}
            >
              <Icon
                className={cn(
                  "size-[18px] shrink-0 transition-colors duration-150 ease-out",
                  active ? "text-sidebar-accent-project" : "text-sidebar-text-tertiary",
                )}
              />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <SectionLabel
          action={<SectionAction label="Open another project" onClick={onAddProject} />}
        >
          Projects
        </SectionLabel>

        <div className="flex flex-col gap-1">
          {projects.length === 0 && (
            <button
              type="button"
              onClick={onAddProject}
              className="flex h-8 items-center gap-2.5 rounded-lg px-2 text-left text-sidebar-text-secondary text-sm transition-colors duration-150 ease-out hover:bg-sidebar-hover hover:text-sidebar-text-primary"
            >
              <DefaultProjectGlyphIcon className="size-[18px] shrink-0" />
              <span>Create a project</span>
            </button>
          )}
          {projects.map((entry) => {
            const projectChats = findChatsForProject(
              entry,
              chatsByProject,
              activeProjectDir,
              chats,
            );

            return (
              <ProjectRow
                key={entry.dir}
                entry={entry}
                active={entry.dir === activeProjectDir}
                chats={projectChats}
                activeSessionId={activeSessionId}
                onSelectProject={onSelectProject}
                onSelectChat={onSelectChat}
                onNewChat={onNewChat}
                onEditProject={onEditProject}
                onRemoveProject={onRemoveProject}
              />
            );
          })}
        </div>

        <SectionLabel>Chats</SectionLabel>
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={onNewChat}
            className="flex h-8 items-center gap-2 rounded-lg px-2 text-left text-[13px] text-sidebar-text-secondary transition-colors duration-150 ease-out hover:bg-sidebar-hover hover:text-sidebar-text-primary"
          >
            <SquarePenIcon className="size-4 shrink-0 text-sidebar-text-tertiary" />
            <span>Start a chat</span>
          </button>

          {standaloneChats.map((chat) => (
            <ChatRow
              key={chat.id}
              title={chat.title || "New chat"}
              updatedAt={chat.updatedAt}
              active={chat.id === activeSessionId}
              onClick={() => onSelectChat(chat.id)}
            />
          ))}
        </div>
      </div>

      <div className="mt-auto shrink-0 border-t border-sidebar-shell-border pt-2">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sidebar-text-secondary text-sm transition-colors duration-150 ease-out hover:bg-sidebar-hover hover:text-sidebar-text-primary"
        >
          <SettingsIcon className="size-[18px] shrink-0 text-sidebar-text-tertiary" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}
