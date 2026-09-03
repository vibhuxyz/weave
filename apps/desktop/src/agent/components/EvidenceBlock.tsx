import { useState } from "react";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import type { EvidenceBlock as EvidenceBlockModel, BlockAction } from "../normalize/types";

export function EvidenceBlock({
  block,
  onAction,
  depth,
}: {
  block: EvidenceBlockModel;
  onAction?: (action: BlockAction) => void;
  depth?: "brief" | "normal" | "deep";
}) {
  const [expanded, setExpanded] = useState(block.expandable ? depth === "deep" : true);

  return (
    <div className="overflow-hidden rounded-md border border-agent-border bg-agent-code-bg shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      {block.title && (
        <div 
          className={cn(
            "flex items-center justify-between bg-agent-surface-raised px-3 py-1.5",
            block.expandable && "cursor-pointer select-none hover:bg-agent-surface-hover"
          )}
          onClick={() => block.expandable && setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-agent-text-muted">{block.kind}</span>
            <span className="font-medium text-xs text-agent-text-strong">{block.title}</span>
          </div>
          {block.expandable && (
            <span className="text-[10px] text-agent-text-muted">{expanded ? "Collapse" : "Expand"}</span>
          )}
        </div>
      )}
      
      {(!block.title || expanded) && (
        <div className="p-3">
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-agent-text-muted">
            {block.content}
          </pre>
          
          {block.truncated && block.fullOutputRef && (
            <div className="mt-3 flex items-center justify-between border-t border-agent-border-subtle pt-3">
              <span className="text-[11px] italic text-agent-text-muted">Output truncated</span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onAction?.({ type: "open_output", outputRef: block.fullOutputRef! })}
              >
                Open full output
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
