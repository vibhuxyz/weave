import { CircleCheckIcon, CircleDashedIcon, CircleIcon, Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react";
import type { PlanItem } from "@/features/chat/hooks";
import { cn } from "@/shared/lib";

const ICON_BUTTON = "rounded-md p-1.5 text-agent-text-muted transition-colors hover:bg-agent-surface-hover hover:text-agent-text";

function StatusIcon({ status }: { readonly status: PlanItem["status"] }) {
  if (status === "completed") return <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-agent-success" aria-label="Done" />;
  if (status === "in_progress") return <CircleIcon className="mt-0.5 size-4 shrink-0 text-agent-text-bright" aria-label="In progress" />;
  return <CircleDashedIcon className="mt-0.5 size-4 shrink-0 text-agent-text-faint" aria-label="Pending" />;
}

export function PlanPanel({
  entries,
  isExpanded,
  onToggleExpanded,
  onClose,
}: {
  readonly entries: readonly PlanItem[];
  readonly isExpanded: boolean;
  readonly onToggleExpanded: () => void;
  readonly onClose: () => void;
}) {
  const Resize = isExpanded ? Minimize2Icon : Maximize2Icon;
  return (
    <aside aria-label="Plan" className="dark flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-agent-surface-raised text-agent-text">
      <header className="flex shrink-0 items-center gap-2 px-4 py-3">
        <h2 className="flex-1 text-agent-text-bright text-sm">Plan</h2>
        <button type="button" onClick={onToggleExpanded} aria-label={isExpanded ? "Shrink panel" : "Expand panel"} className={ICON_BUTTON}>
          <Resize className="size-4" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close plan" className={ICON_BUTTON}>
          <XIcon className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <h3 className="py-2 font-medium text-[11px] text-agent-text-faint uppercase tracking-wider">Tasks</h3>
        <ul className="flex flex-col gap-2.5">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-2.5 text-sm">
              <StatusIcon status={entry.status} />
              <span className={cn("min-w-0", entry.status === "completed" ? "text-agent-text-muted" : "text-agent-text")}>{entry.content}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
