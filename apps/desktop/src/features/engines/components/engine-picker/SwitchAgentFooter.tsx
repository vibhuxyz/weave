import { ArrowLeftRight } from "lucide-react";

interface SwitchAgentFooterProps {
  onSwitchAgent: () => void;
}

export function SwitchAgentFooter({ onSwitchAgent }: SwitchAgentFooterProps) {
  return (
    <div className="mx-1 mt-2 border-t border-white/10 pt-1.5">
      <button
        type="button"
        onClick={onSwitchAgent}
        className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:bg-white/5 focus-visible:text-white focus-visible:outline-none"
      >
        <ArrowLeftRight className="size-4 shrink-0" />
        <span>Switch agent</span>
      </button>
    </div>
  );
}
