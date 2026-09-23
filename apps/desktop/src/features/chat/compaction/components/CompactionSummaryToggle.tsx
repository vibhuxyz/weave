import { useId, useState } from "react";
import { MessageResponse } from "@/shared/ui/ai-elements";

const SUMMARY_PROSE =
  "text-sm leading-7 text-agent-text [&_p]:my-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-agent-text-bright [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-agent-surface-hover [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em]";

export function CompactionSummaryToggle({ summary }: { readonly summary: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
        className="rounded text-agent-progress-fg transition-colors hover:text-agent-text-bright focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-agent-progress-fg"
      >
        {isOpen ? "▾ hide summary" : "▸ view summary"}
      </button>
      {isOpen && (
        <div
          id={panelId}
          className="mt-2 max-h-96 w-[min(44rem,85vw)] overflow-y-auto rounded-lg border border-border/60 bg-foreground/[0.03] px-4 py-3 font-sans text-sm leading-6 text-agent-text"
        >
          <div className={SUMMARY_PROSE}>
            <MessageResponse>{summary}</MessageResponse>
          </div>
        </div>
      )}
    </div>
  );
}
