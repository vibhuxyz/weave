import { useState } from "react";
import { AlertTriangleIcon, FileIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/cn";
import type { FindingBlock, BlockAction, EvidenceRow } from "../normalize/types";
import { CodePanel } from "./CodePanel";
import { Prose } from "./Prose";

const SEVERITY_CLASS: Record<FindingBlock["severity"], string> = {
  critical: "border-agent-critical/70 bg-agent-critical-bg text-agent-critical-fg",
  high: "border-agent-high/70 bg-agent-high-bg text-agent-high-fg",
  medium: "border-agent-medium/70 bg-agent-medium-bg text-agent-medium-fg",
  low: "border-agent-low/70 bg-agent-low-bg text-agent-low-fg",
  info: "border-agent-info bg-agent-surface-inset text-agent-info-fg",
};

export function FindingCard({
  block,
  onAction,
}: {
  block: FindingBlock;
  onAction?: (action: BlockAction) => void;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const seq = block.source?.seqStart;

  return (
    <section
      className={cn(
        "space-y-3 rounded-lg border p-4 shadow-[inset_3px_0_0_currentColor]",
        SEVERITY_CLASS[block.severity],
      )}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={SEVERITY_CLASS[block.severity]}>
            <AlertTriangleIcon />
            {block.severity.toUpperCase()}
          </Badge>
          {block.verified && (
            <Badge
              variant="secondary"
              className="border-agent-success/30 bg-agent-success-bg text-agent-success"
            >
              verified
            </Badge>
          )}
        </div>
        <h3 className="font-semibold text-base text-agent-text-bright">{block.title}</h3>
        {block.location && (
          <button
            type="button"
            onClick={() =>
              onAction?.({
                type: "open_file",
                file: block.location!.file,
                line: block.location!.line,
              })
            }
            className="flex items-center gap-1.5 font-mono text-agent-text-muted text-xs hover:text-agent-text-bright hover:underline outline-none"
          >
            <FileIcon className="size-3" />
            {block.location.file}
            {block.location.line ? `:${block.location.line}` : ""}
          </button>
        )}
      </div>

      {block.body && <Prose>{block.body}</Prose>}

      {block.evidenceCode && (
        <CodePanel
          code={block.evidenceCode.code}
          language={block.evidenceCode.language}
          title="evidence"
        />
      )}
      {block.evidence.length > 0 && (showEvidence || !block.evidenceCode) && (
        <EvidenceRows rows={block.evidence} />
      )}

      <div className="flex items-center justify-between gap-3 border-t border-agent-border-subtle pt-2">
        <div className="flex flex-wrap gap-2">
          {(block.actions ?? []).map((action, index) => (
            <Button
              key={action}
              type="button"
              size="xs"
              variant={index === 0 ? "subtle" : "ghost"}
              onClick={() => {
                const a = action.toLowerCase();
                if (a.includes("fix") || a.includes("apply")) {
                  onAction?.({ type: "apply_fix", findingId: block.id });
                } else if (a.includes("open file") && block.location) {
                  onAction?.({
                    type: "open_file",
                    file: block.location.file,
                    line: block.location.line,
                  });
                } else if (a.includes("evidence")) {
                  setShowEvidence((v) => !v);
                } else {
                  onAction?.({ type: "send_message", text: `${action}: ${block.title}` });
                }
              }}
            >
              {action}
            </Button>
          ))}
        </div>
        <span className="shrink-0 font-mono text-[10px] text-agent-text-faint">
          {block.severity} · {block.findingStatus ?? "discovered"} ·{" "}
          {block.location?.file ?? "no file"}
          {seq != null ? ` · #${seq}` : ""}
        </span>
      </div>
    </section>
  );
}

function EvidenceRows({ rows }: { rows: EvidenceRow[] }) {
  return (
    <div className="rounded-md border border-agent-code-border bg-agent-code-bg p-3 font-mono text-xs">
      {rows.map((row, i) => (
        <div
          key={`${row.label}-${i}`}
          className="flex items-center justify-between gap-4 py-0.5"
        >
          <span className="truncate text-agent-text-muted">{row.label}</span>
          <span
            className={cn(
              "shrink-0",
              row.status === "failed" && "text-agent-critical-fg",
              row.status === "ok" && "text-agent-success",
              row.status === "warning" && "text-agent-warn",
            )}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
