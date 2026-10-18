import { MaximizeIcon, MinimizeIcon, PanelLeftIcon, SearchIcon, XIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import type { Commit, DiffSource, RefsState } from "../../types";
import { BranchPill } from "./BranchPill";

const ICON_BUTTON = "rounded-md p-1.5 text-agent-text-muted transition-colors hover:bg-agent-surface-hover hover:text-agent-text-bright";

export function ViewerHeader({
  refs,
  commits,
  source,
  isSidebarOpen,
  isExpanded,
  isSearchOpen,
  onPickSource,
  onToggleSidebar,
  onToggleSearch,
  onToggleExpanded,
  onClose,
}: {
  readonly refs: RefsState | null;
  readonly commits: readonly Commit[];
  readonly source: DiffSource;
  readonly isSidebarOpen: boolean;
  readonly isExpanded: boolean;
  readonly isSearchOpen: boolean;
  readonly onPickSource: (source: DiffSource) => void;
  readonly onToggleSidebar: () => void;
  readonly onToggleSearch: () => void;
  readonly onToggleExpanded: () => void;
  readonly onClose: () => void;
}) {
  const Resize = isExpanded ? MinimizeIcon : MaximizeIcon;
  return (
    <header className="flex shrink-0 items-center gap-2 px-3 py-2.5">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={isSidebarOpen ? "Hide the file tree" : "Show the file tree"}
        aria-pressed={isSidebarOpen}
        className={cn(ICON_BUTTON, isSidebarOpen && "bg-agent-surface-hover text-agent-text-bright")}
      >
        <PanelLeftIcon className="size-4" />
      </button>
      {source.kind === "file" ? (
        <span className="truncate text-[13px] text-agent-text-bright">{source.path}</span>
      ) : (
        <BranchPill refs={refs} commits={commits} source={source} onPickSource={onPickSource} />
      )}
      <span className="flex-1" />
      <button
        type="button"
        onClick={onToggleSearch}
        aria-label="Search changed files"
        aria-pressed={isSearchOpen}
        className={cn(ICON_BUTTON, isSearchOpen && "text-agent-text-bright")}
      >
        <SearchIcon className="size-4" />
      </button>
      <button type="button" onClick={onToggleExpanded} aria-label={isExpanded ? "Shrink the panel" : "Expand the panel"} className={ICON_BUTTON}>
        <Resize className="size-4" />
      </button>
      <button type="button" onClick={onClose} aria-label="Close the diff" className={ICON_BUTTON}>
        <XIcon className="size-4" />
      </button>
    </header>
  );
}
