import {
  BookOpenIcon,
  ChevronDownIcon,
  FolderIcon,
  HomeIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { DefaultProjectGlyphIcon } from "@/features/projects/ui/DefaultProjectGlyphIcon";
import { useState } from "react";
import { basename, tildeHome } from "./paths";
import { cn } from "@/shared/lib/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import type { ConversationMeta } from "./useAcpChat";
import type { ProjectEntry } from "./useProjects";

export type SidebarView = "home" | "chat" | "agents" | "skills";

export interface SidebarProps {
  projects: ProjectEntry[];
  activeProjectDir: string | undefined;
  onSelectProject: (dir: string) => void;
  onAddProject: () => void;
  onEditProject: (entry: ProjectEntry) => void;
  onRemoveProject: (dir: string) => void;
  chats: ConversationMeta[];
  activeSessionId: string | null;
  onSelectChat: (sessionId: string) => void;
  onNewChat: () => void;
  view: SidebarView;
  onViewChange: (view: SidebarView) => void;
}

const NAV = [
  { id: "home", label: "Home", icon: HomeIcon, view: "home" as const },
  { id: "agents", label: "Agents", icon: SparklesIcon, view: "agents" as const },
  { id: "skills", label: "Skills", icon: BookOpenIcon, view: "skills" as const },
] as const;

/** Compact "how long ago" — 5m, 16h, 3d, 2w. */
function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

function SectionLabel({
  children,
  action,
  collapsed,
  onToggleCollapsed,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  /** Omit both collapse props for a plain, non-collapsible heading. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const collapsible = onToggleCollapsed !== undefined;
  return (
    // Sections are separated by whitespace, not rules: ~26px above the
    // heading, ~10px below it before the first row.
    <div className="flex items-center justify-between px-2.5 pt-[26px] pb-2.5">
      {collapsible ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          className="-ml-1 flex items-center gap-1 rounded text-[13px] text-sidebar-text-secondary transition-colors duration-150 ease-out hover:text-sidebar-text-primary"
        >
          <ChevronDownIcon
            className={cn(
              "size-3.5 transition-transform duration-150",
              collapsed && "-rotate-90",
            )}
          />
          {children}
        </button>
      ) : (
        <p className="text-[13px] text-sidebar-text-secondary">{children}</p>
      )}
      {action}
    </div>
  );
}

/** The quiet "+" beside a section heading — no border, surface only on hover. */
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
      className="flex size-6 items-center justify-center rounded-full text-sidebar-text-tertiary transition-colors duration-150 ease-out hover:bg-sidebar-hover hover:text-sidebar-text-primary"
    >
      <PlusIcon className="size-[18px]" />
    </button>
  );
}

export function Sidebar({
  projects,
  activeProjectDir,
  onSelectProject,
  onAddProject,
  onEditProject,
  onRemoveProject,
  chats,
  activeSessionId,
  onSelectChat,
  onNewChat,
  view,
  onViewChange,
}: SidebarProps) {
  const [chatsCollapsed, setChatsCollapsed] = useState(false);

  return (
    <aside className="flex h-full max-h-full w-full shrink-0 flex-col overflow-hidden rounded-[11px] border border-sidebar-shell-border bg-sidebar-shell px-3 py-4 shadow-[var(--sidebar-shell-shadow)]">
      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ id, label, icon: Icon, view: navView }) => {
          const active = navView === view;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onViewChange(navView)}
              className={cn(
                "flex h-[38px] items-center gap-[11px] rounded-lg px-2.5 text-left text-sm transition-colors duration-150 ease-out",
                active
                  ? "bg-sidebar-selected text-sidebar-text-primary"
                  : "text-sidebar-text-secondary hover:bg-sidebar-hover hover:text-sidebar-text-primary",
              )}
            >
              <Icon
                className={cn(
                  "size-[18px] shrink-0 transition-colors duration-150 ease-out",
                  active ? "text-sidebar-accent-project" : "text-sidebar-text-tertiary",
                )}
              />
              {label}
            </button>
          );
        })}
      </nav>

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
            className="flex h-[38px] items-center gap-[11px] rounded-lg px-2.5 text-left text-sidebar-text-secondary text-sm transition-colors duration-150 ease-out hover:bg-sidebar-hover hover:text-sidebar-text-primary"
          >
            <DefaultProjectGlyphIcon className="size-[18px] shrink-0" />
            Create a project
          </button>
        )}
        {projects.map((entry) => {
          const active = entry.dir === activeProjectDir;
          return (
            <div
              key={entry.dir}
              className={cn(
                "group relative overflow-hidden rounded-[10px] transition-colors duration-150 ease-out",
                active ? "bg-sidebar-selected" : "hover:bg-sidebar-hover",
              )}
            >
              {/* Selection reads from the accent rail, not from a colour wash. */}
              {active && (
                <span className="absolute top-1 bottom-1 left-0 w-[3px] rounded-full bg-sidebar-accent-project" />
              )}
              <button
                type="button"
                onClick={() => onSelectProject(entry.dir)}
                className={cn(
                  "flex w-full flex-col justify-center gap-0.5 px-2.5 pr-9 text-left transition-colors duration-150 ease-out",
                  active ? "h-[60px]" : "h-[38px]",
                )}
              >
                <span className="flex items-center gap-[11px]">
                  {entry.icon ? (
                    <img
                      src={entry.icon}
                      alt=""
                      className="size-[18px] shrink-0 rounded-[4px] object-cover"
                    />
                  ) : (
                    <FolderIcon
                      className={cn(
                        "size-[18px] shrink-0 transition-colors duration-150 ease-out",
                        !entry.tint &&
                          (active
                            ? "text-sidebar-accent-project"
                            : "text-sidebar-text-tertiary group-hover:text-sidebar-text-secondary"),
                      )}
                      style={entry.tint ? { color: entry.tint } : undefined}
                    />
                  )}
                  <span
                    className={cn(
                      "truncate text-sm transition-colors duration-150 ease-out",
                      active
                        ? "font-medium text-sidebar-text-primary"
                        : "text-sidebar-text-secondary group-hover:text-sidebar-text-primary",
                    )}
                  >
                    {entry.name || basename(entry.dir)}
                  </span>
                </span>
                {active && (
                  <span className="truncate pl-[29px] text-[11px] text-sidebar-text-tertiary">
                    {tildeHome(entry.dir)}
                  </span>
                )}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${entry.name || basename(entry.dir)} options`}
                    className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md text-sidebar-text-tertiary opacity-0 transition-opacity duration-150 ease-out hover:bg-sidebar-hover hover:text-sidebar-text-primary group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                  >
                    <MoreHorizontalIcon className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEditProject(entry)}>
                    <PencilIcon className="size-3.5" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onRemoveProject(entry.dir)}
                  >
                    <Trash2Icon className="size-3.5" />
                    Remove from workspace
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>

      <SectionLabel
        collapsed={chatsCollapsed}
        onToggleCollapsed={() => setChatsCollapsed((open) => !open)}
        action={<SectionAction label="New chat" onClick={onNewChat} />}
      >
        Chats
      </SectionLabel>

      <div
        hidden={chatsCollapsed}
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto"
      >
        {chats.length === 0 && (
          <button
            type="button"
            onClick={onNewChat}
            className="flex h-11 items-center gap-[11px] rounded-lg px-2.5 text-left text-sidebar-text-secondary text-sm transition-colors duration-150 ease-out hover:bg-sidebar-hover hover:text-sidebar-text-primary"
          >
            <MessageSquareIcon className="size-[18px] shrink-0" />
            Start a chat
          </button>
        )}
        {chats.map((chat) => {
          const active = chat.id === activeSessionId;
          return (
            <button
              key={chat.id}
              type="button"
              onClick={() => onSelectChat(chat.id)}
              className={cn(
                "group relative flex h-11 items-center gap-[11px] overflow-hidden rounded-[9px] px-2.5 text-left text-sm transition-colors duration-150 ease-out",
                // Orange is reserved for the selected conversation — hover
                // never borrows it.
                active
                  ? "bg-[image:var(--sidebar-selected-chat-bg)]"
                  : "hover:bg-sidebar-hover",
              )}
            >
              {active && (
                <span className="absolute top-1 bottom-1 left-0 w-[3px] rounded-full bg-sidebar-accent-chat" />
              )}
              <MessageSquareIcon
                className={cn(
                  "size-[18px] shrink-0 transition-colors duration-150 ease-out",
                  active
                    ? "text-sidebar-accent-chat"
                    : "text-sidebar-text-tertiary group-hover:text-sidebar-text-secondary",
                )}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate transition-colors duration-150 ease-out",
                  active
                    ? "text-sidebar-text-primary"
                    : "text-sidebar-text-secondary group-hover:text-sidebar-text-primary",
                )}
              >
                {chat.title || "New chat"}
              </span>
              <span
                className={cn(
                  "shrink-0 text-[11px] tabular-nums transition-colors duration-150 ease-out",
                  active
                    ? "text-sidebar-text-secondary"
                    : "text-sidebar-text-tertiary group-hover:text-sidebar-text-secondary",
                )}
              >
                {ago(chat.updatedAt)}
              </span>
            </button>
          );
        })}
      </div>

      {/* The only rule in the panel — everything else groups by whitespace. */}
      <div className="mt-4 border-sidebar-shell-border border-t pt-3">
        <button
          type="button"
          disabled
          className="flex h-[38px] w-full items-center gap-[11px] rounded-lg px-2.5 text-left text-sidebar-text-secondary text-sm transition-colors duration-150 ease-out hover:bg-sidebar-hover hover:text-sidebar-text-primary disabled:pointer-events-none disabled:opacity-45"
        >
          <SettingsIcon className="size-[18px] shrink-0 text-sidebar-text-tertiary" />
          Settings
        </button>
      </div>
    </aside>
  );
}
