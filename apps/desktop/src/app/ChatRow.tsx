import { ArchiveIcon } from "lucide-react";
import { cn } from "@/shared/lib";

export interface ChatRowProps {
  title: string;
  updatedAt: number;
  active: boolean;
  onClick: () => void;
  onArchive?: () => void;
  isArchiveDisabled?: boolean;
}

/** Compact "how long ago" — 5m, 16h, 3d, 2w. */
export function ago(ts: number): string {
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

export function ChatRow({ title, updatedAt, active, onClick, onArchive, isArchiveDisabled = false }: ChatRowProps) {
  const hasArchive = onArchive !== undefined;
  return (
    <div className="group/chat relative">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-left text-[13px] transition-colors duration-150 ease-out",
          active
            ? "bg-white/10 text-white font-medium shadow-sm"
            : "text-sidebar-text-secondary hover:bg-sidebar-hover hover:text-sidebar-text-primary",
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {title}
        </span>
        <span
          className={cn(
            "shrink-0 text-[11px] tabular-nums ml-2 transition-opacity duration-150 ease-out",
            active
              ? "text-white/70"
              : "text-sidebar-text-tertiary group-hover/chat:text-sidebar-text-secondary",
            hasArchive && "group-hover/chat:opacity-0 group-focus-within/chat:opacity-0",
          )}
        >
          {ago(updatedAt)}
        </span>
      </button>
      {hasArchive && (
        <button
          type="button"
          onClick={onArchive}
          disabled={isArchiveDisabled}
          aria-label={`Archive chat ${title}`}
          title={isArchiveDisabled ? "Stop the running reply before archiving this chat" : "Archive chat"}
          className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-text-tertiary opacity-0 transition-opacity duration-150 ease-out hover:bg-sidebar-hover hover:text-sidebar-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/chat:opacity-100 disabled:cursor-not-allowed disabled:hover:text-sidebar-text-tertiary"
        >
          <ArchiveIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}
