import {
  BookOpenIcon,
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

export type SidebarView = "home" | "chat" | "agents";

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
  { id: "skills", label: "Skills", icon: BookOpenIcon, view: null },
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
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-3 pt-5 pb-1.5">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">
        {children}
      </p>
      {action}
    </div>
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
  return (
    <aside className="flex max-h-full w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-agent-surface-raised p-2">
      <nav className="flex flex-col gap-0.5 pt-2">
        {NAV.map(({ id, label, icon: Icon, view: navView }) => {
          const active = navView !== null && navView === view;
          return (
            <button
              key={id}
              type="button"
              // "Skills" has no screen yet — stays disabled.
              disabled={navView === null}
              onClick={navView ? () => onViewChange(navView) : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
                navView === null && "text-foreground/90 disabled:opacity-40",
                navView !== null &&
                  (active
                    ? "bg-secondary text-foreground"
                    : "text-foreground/80 hover:bg-secondary/60 hover:text-foreground"),
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          );
        })}
      </nav>

      <SectionLabel
        action={
          <button
            type="button"
            onClick={onAddProject}
            title="Open another project"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <PlusIcon className="size-4" />
          </button>
        }
      >
        Projects
      </SectionLabel>

      <div className="flex flex-col gap-0.5">
        {projects.length === 0 && (
          <button
            type="button"
            onClick={onAddProject}
            className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-muted-foreground text-sm hover:bg-secondary/60 hover:text-foreground"
          >
            <FolderIcon className="size-4 shrink-0" />
            Open a project
          </button>
        )}
        {projects.map((entry) => {
          const active = entry.dir === activeProjectDir;
          return (
            <div
              key={entry.dir}
              className={cn(
                "group relative rounded-lg transition-colors",
                active
                  ? "bg-secondary"
                  : "hover:bg-secondary/60",
              )}
            >
              <button
                type="button"
                onClick={() => onSelectProject(entry.dir)}
                className={cn(
                  "flex w-full flex-col rounded-lg px-3 py-1.5 pr-9 text-left text-sm transition-colors",
                  active
                    ? "text-foreground"
                    : "text-foreground/80 group-hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-2.5">
                  {entry.icon ? (
                    <img
                      src={entry.icon}
                      alt=""
                      className="size-4 shrink-0 rounded-[4px] object-cover"
                    />
                  ) : (
                    <FolderIcon
                      className="size-4 shrink-0"
                      style={entry.tint ? { color: entry.tint } : undefined}
                    />
                  )}
                  <span className="truncate">
                    {entry.name || basename(entry.dir)}
                  </span>
                </span>
                {active && (
                  <span className="truncate pl-[26px] text-muted-foreground text-xs">
                    {tildeHome(entry.dir)}
                  </span>
                )}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${entry.name || basename(entry.dir)} options`}
                    className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-black/20 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
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
        action={
          <button
            type="button"
            onClick={onNewChat}
            title="New chat"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <PlusIcon className="size-4" />
          </button>
        }
      >
        Chats
      </SectionLabel>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {chats.length === 0 && (
          <button
            type="button"
            onClick={onNewChat}
            className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-muted-foreground text-sm hover:bg-secondary/60 hover:text-foreground"
          >
            <MessageSquareIcon className="size-4 shrink-0" />
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
                "group relative flex items-center gap-2 rounded-lg py-1.5 pr-2 pl-3 text-left text-sm transition-colors",
                active
                  ? "bg-[linear-gradient(90deg,rgba(255,122,82,0.16),rgba(255,122,82,0.03))] text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              {active && (
                <span className="absolute top-1 bottom-1 left-0 w-[3px] rounded-full bg-[#ff7a52]" />
              )}
              <span className="min-w-0 flex-1 truncate">
                {chat.title || "New chat"}
              </span>
              <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                {ago(chat.updatedAt)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 border-border/60 border-t pt-2">
        <button
          type="button"
          disabled
          className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-40"
        >
          <SettingsIcon className="size-4" />
          Settings
        </button>
      </div>
    </aside>
  );
}
