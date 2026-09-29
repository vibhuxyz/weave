import { cn } from "@/shared/lib";
import type { SlashCommand } from "./catalog";

interface CommandMenuProps {
  readonly commands: readonly SlashCommand[];
  readonly activeIndex: number;
  readonly onHighlight: (index: number) => void;
  readonly onPick: (command: SlashCommand) => void;
}

export function CommandMenu({ commands, activeIndex, onHighlight, onPick }: CommandMenuProps) {
  if (commands.length === 0) return null;
  return (
    <div
      role="listbox"
      aria-label="Commands"
      className="absolute bottom-full left-0 z-20 mb-2 w-96 overflow-hidden rounded-2xl border border-agent-border bg-agent-surface-raised p-2 shadow-[0_20px_56px_rgba(0,0,0,0.5)]"
    >
      <div className="px-2 pb-2 text-xs text-agent-text-faint">Commands</div>
      <div className="max-h-72 overflow-y-auto pr-1">
        {commands.map((command, index) => (
          <button
            key={command.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            onMouseEnter={() => onHighlight(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(command);
            }}
            className={cn(
              "flex w-full flex-col gap-0.5 rounded-xl px-2.5 py-2 text-left transition-colors",
              index === activeIndex && "bg-agent-surface-hover",
            )}
          >
            <span className="flex items-baseline gap-2">
              <span className="font-mono text-agent-text-bright text-sm">{command.trigger}</span>
              <span className="text-agent-text text-sm">{command.title}</span>
            </span>
            <span className="text-[11px] text-agent-text-faint">{command.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
