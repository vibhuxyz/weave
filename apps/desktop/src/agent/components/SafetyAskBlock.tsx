import { useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import type { SafetyAskBlock as SafetyAskBlockModel } from "../normalize/types";
import { CodePanel } from "./CodePanel";

export function SafetyAskBlock({
  block,
  onSend,
  changed = false,
}: {
  block: SafetyAskBlockModel;
  onSend?: (text: string) => void;
  changed?: boolean;
}) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [sentChoice, setSentChoice] = useState<string | null>(null);

  const toggleRow = (index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleChoiceClick = (choice: string) => {
    setSentChoice(choice);
    onSend?.(`Context: ${choice}. Please continue.`);
  };

  const anyHasEvidence = block.concerns.some((c) => c.evidence);

  return (
    <section className="space-y-6">
      <div className="space-y-5 rounded-lg border border-agent-accent-strong/35 bg-agent-critical-bg p-4">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="outline" className="border-agent-accent-strong/60 text-agent-critical-fg font-medium tracking-wide">
              {block.title.toUpperCase()}
            </Badge>
            <span className="text-agent-text-muted text-xs">
              {changed ? "changes were made" : "no files edited · no commands run"}
            </span>
          </div>
          <p className="text-sm font-medium leading-6 text-agent-text-bright">{block.body}</p>
        </div>

        {block.actuallyIs && (
          <div className="pt-2 border-t border-agent-border-subtle">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-agent-text-muted">
              What it actually is
            </p>
            <p className="text-sm leading-6 text-agent-text-strong">{block.actuallyIs}</p>
          </div>
        )}
      </div>

      {block.concerns.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <p className="shrink-0 font-mono text-agent-text-muted text-[10px] uppercase tracking-[0.08em]">
              What concerns me
            </p>
            <div className="h-px flex-1 bg-agent-border-subtle" />
            <p className="shrink-0 font-mono text-agent-text-muted text-[10px]">
              {block.concerns.length} concern{block.concerns.length === 1 ? "" : "s"}
              {anyHasEvidence && <span className="ml-1 opacity-60">· tap to see the evidence</span>}
            </p>
          </div>
          
          <div className="space-y-2">
            {block.concerns.map((concern, index) => {
              const isExpanded = expandedRows.has(index);
              const hasEvidence = Boolean(concern.evidence);
              return (
                <div
                  key={`${concern.title}-${index}`}
                  className="rounded-lg border border-agent-critical/35 bg-agent-surface-inset p-3 transition-colors hover:bg-agent-surface-hover"
                >
                  {/* Clickable header row */}
                  <div
                    className={`flex items-center justify-between gap-3 ${hasEvidence ? "cursor-pointer select-none" : ""}`}
                    onClick={() => hasEvidence && toggleRow(index)}
                  >
                    <p className="min-w-0 font-medium text-sm text-agent-text-strong">
                      <span className="mr-3 font-mono text-agent-text-muted/60">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {concern.title}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className="border-agent-critical/30 bg-agent-critical/10 text-agent-critical-fg font-normal lowercase">
                        {concern.tag}
                      </Badge>
                      {hasEvidence && (
                        <span className="text-agent-text-muted/60 transition-transform duration-200">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Evidence — only visible when expanded */}
                  {hasEvidence && isExpanded && (
                    <div className="mt-3">
                      <CodePanel code={concern.evidence!} copyable={false} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-agent-accent/40 bg-agent-surface-inset p-4">
        <h3 className="font-semibold text-sm text-agent-text-bright">
          {block.title && block.title.toLowerCase() !== "stopping to ask"
            ? block.title
            : "Before I go further — what's the context?"}
        </h3>
        {block.actionSubtitle && (
          <p className="mt-1.5 text-sm text-agent-text-muted">{block.actionSubtitle}</p>
        )}
        {block.choices.length === 0 ? (
          <p className="mt-3 text-sm text-agent-text-muted">
            Reply with the context and I'll continue.
          </p>
        ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {block.choices.map((choice) => {
            const isSent = sentChoice === choice;
            return (
              <Button
                key={choice}
                type="button"
                size="xs"
                variant="outline"
                className={isSent ? "text-agent-success border border-agent-success/30 bg-agent-success-bg" : "border-agent-border bg-agent-surface-inset text-agent-text-strong hover:bg-agent-surface-hover hover:text-agent-text-bright"}
                onClick={() => handleChoiceClick(choice)}
                disabled={sentChoice !== null && !isSent}
              >
                {isSent && <Check className="mr-1.5 h-3 w-3 shrink-0" />}
                {choice}
              </Button>
            );
          })}
        </div>
        )}
      </div>
    </section>
  );
}
