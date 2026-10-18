import { ChevronRightIcon, CodeXmlIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import { StatCounts } from "../StatCounts";

export function FileSectionHeader({
  name,
  dir,
  oldPath,
  additions,
  deletions,
  isOpen,
  onToggle,
  onCopy,
  isCopied,
}: {
  readonly name: string;
  readonly dir: string;
  readonly oldPath?: string;
  readonly additions: number;
  readonly deletions: number;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly onCopy: () => void;
  readonly isCopied: boolean;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-diff-file-header-border border-b bg-diff-file-header-bg px-2.5 py-2">
      <button type="button" onClick={onToggle} aria-expanded={isOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <ChevronRightIcon className={cn("size-3.5 shrink-0 text-agent-text-faint transition-transform", isOpen && "rotate-90")} />
        <CodeXmlIcon className="size-3.5 shrink-0 text-agent-text-faint" />
        <span className="truncate font-medium text-[13px] text-agent-text-bright">{name}</span>
        {dir && <span className="truncate text-[12px] text-agent-text-faint">{dir}</span>}
        {oldPath && <span className="shrink-0 text-[11px] text-agent-text-faint italic">renamed</span>}
      </button>
      <StatCounts additions={additions} deletions={deletions} />
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 text-[10px] text-agent-text-faint transition-colors hover:text-agent-text-bright"
      >
        {isCopied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
