import {
  BookOpenIcon,
  FolderIcon,
  HomeIcon,
  MessageSquareIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react";
import { basename } from "./paths";
import { cn } from "@/shared/lib/cn";

export interface SidebarProps {
  projectDir: string;
  onChooseProject: () => void;
  onNewChat: () => void;
  /** True when this conversation was restored from a previous run. */
  resumed: boolean;
}

const NAV = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "agents", label: "Agents", icon: SparklesIcon },
  { id: "skills", label: "Skills", icon: BookOpenIcon },
] as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-5 pb-1 text-muted-foreground text-xs">{children}</p>
  );
}

export function Sidebar({
  projectDir,
  onChooseProject,
  onNewChat,
  resumed,
}: SidebarProps) {
  return (
    <aside className="flex w-56 shrink-0 flex-col rounded-xl bg-secondary/30 p-2">
      <nav className="flex flex-col gap-0.5 pt-8">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            // Not wired yet — these screens do not exist. Shown so the shell
            // matches Berd's, and disabled so it cannot lie about what works.
            disabled
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm",
              "text-foreground/90 disabled:opacity-40",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>

      <SectionLabel>Projects</SectionLabel>
      <button
        type="button"
        onClick={onChooseProject}
        className="flex items-center gap-2.5 rounded-lg bg-secondary px-3 py-1.5 text-left text-sm transition-colors hover:bg-secondary/70"
      >
        <FolderIcon className="size-4 shrink-0" />
        <span className="truncate">{basename(projectDir)}</span>
      </button>

      <SectionLabel>Chats</SectionLabel>
      <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1.5 text-sm">
        <MessageSquareIcon className="size-4 shrink-0" />
        <span className="truncate">Current</span>
        {resumed && (
          <span
            title="Restored from your last run"
            className="ml-auto text-muted-foreground text-xs"
          >
            resumed
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onNewChat}
        className="mt-1 flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-muted-foreground text-sm transition-colors hover:bg-secondary/60 hover:text-foreground"
      >
        <PlusIcon className="size-4 shrink-0" />
        New chat
      </button>

      <div className="mt-auto border-border/60 border-t pt-2">
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
