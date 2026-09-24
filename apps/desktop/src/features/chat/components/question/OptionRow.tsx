import { cn } from "@/shared/lib";
import type { QuestionStepOption } from "@/features/chat/hooks";

export function OptionRow({
  option,
  shortcut,
  isSelected,
  allowsMultiple,
  isDisabled,
  onPick,
}: {
  option: QuestionStepOption;
  shortcut: number | null;
  isSelected: boolean;
  allowsMultiple: boolean;
  isDisabled: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <button
      type="button"
      role={allowsMultiple ? "checkbox" : "radio"}
      aria-checked={isSelected}
      disabled={isDisabled}
      onClick={() => onPick(option.value)}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors disabled:opacity-60",
        isSelected
          ? "bg-agent-surface-hover ring-1 ring-agent-border-strong"
          : "bg-agent-surface-inset hover:bg-agent-surface-hover",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-agent-text-strong text-sm">{option.label}</span>
        {option.description && <span className="text-agent-text-muted text-xs">{option.description}</span>}
      </span>
      {shortcut !== null && <ShortcutKey value={shortcut} />}
    </button>
  );
}

export function ShortcutKey({ value }: { value: number }) {
  return (
    <kbd className="shrink-0 rounded border border-agent-border px-1.5 font-sans text-agent-text-muted text-xs">
      {value}
    </kbd>
  );
}
