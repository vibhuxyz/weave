import { ChevronDownIcon, XIcon } from "lucide-react";
import { cn } from "@/shared/lib";

const ICON_BUTTON_CLASS =
  "rounded-md p-1 text-agent-text-muted transition-colors hover:bg-agent-surface-hover hover:text-agent-text disabled:opacity-50";

export function QuestionHeader({
  position,
  heading,
  isCollapsed,
  isDisabled,
  onToggleCollapsed,
  onClose,
}: {
  position: string | null;
  heading: string;
  isCollapsed: boolean;
  isDisabled: boolean;
  onToggleCollapsed: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start gap-2.5">
      {position && (
        <span className="mt-0.5 shrink-0 rounded-full bg-agent-warn-bg px-2 py-0.5 text-agent-warn text-xs tabular-nums">
          {position}
        </span>
      )}
      <h3 className="min-w-0 flex-1 whitespace-pre-wrap font-medium text-agent-text-strong text-sm">{heading}</h3>
      <button
        type="button"
        aria-label={isCollapsed ? "Expand question" : "Collapse question"}
        aria-expanded={!isCollapsed}
        onClick={onToggleCollapsed}
        className={ICON_BUTTON_CLASS}
      >
        <ChevronDownIcon className={cn("size-4 transition-transform", isCollapsed && "-rotate-90")} />
      </button>
      <button type="button" aria-label="Dismiss question" disabled={isDisabled} onClick={onClose} className={ICON_BUTTON_CLASS}>
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
