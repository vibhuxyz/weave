import { CONTEXT_PANEL_TABS, type ContextPanelTab } from "@/features/chat/components";
import { cn } from "@/shared/lib";

const ACTIVE_TAB: ContextPanelTab = "Files";

export function DiffPanelTabs({ onSelect }: { readonly onSelect: (tab: ContextPanelTab) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-4 border-agent-border border-b px-4 pt-3 pb-2 text-sm">
      {CONTEXT_PANEL_TABS.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => name !== ACTIVE_TAB && onSelect(name)}
          aria-current={name === ACTIVE_TAB ? "page" : undefined}
          className={cn(
            "transition-colors",
            name === ACTIVE_TAB
              ? "border-agent-accent border-b-2 pb-1 text-agent-text-bright"
              : "text-agent-text-faint hover:text-agent-text-bright",
          )}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
