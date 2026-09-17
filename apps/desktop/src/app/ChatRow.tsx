import { cn } from "@/shared/lib";

export interface ChatRowProps {
  title: string;
  updatedAt: number;
  active: boolean;
  onClick: () => void;
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

export function ChatRow({ title, updatedAt, active, onClick }: ChatRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group/chat flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-left text-[13px] transition-colors duration-150 ease-out",
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
          "shrink-0 text-[11px] tabular-nums ml-2 transition-colors duration-150 ease-out",
          active
            ? "text-white/70"
            : "text-sidebar-text-tertiary group-hover/chat:text-sidebar-text-secondary",
        )}
      >
        {ago(updatedAt)}
      </span>
    </button>
  );
}
