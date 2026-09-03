import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/cn";
import type { FindingBlock } from "../normalize/types";
import { EvidenceBlock } from "./EvidenceBlock";

const SEVERITY_CLASS: Record<FindingBlock["severity"], string> = {
  critical: "border-[#ff6f6f]/70 bg-[#2a151a] text-[#ff8b8b]",
  high: "border-[#f3a341]/70 bg-[#251b12] text-[#f7b862]",
  medium: "border-[#e6cc4b]/70 bg-[#242012] text-[#eadc78]",
  low: "border-[#61a8ff]/70 bg-[#121d2a] text-[#8fc0ff]",
  info: "border-[#7f7a8c] bg-[#181820] text-[#b7b1c2]",
};

export function FindingCard({ block }: { block: FindingBlock }) {
  return (
    <section
      className={cn(
        "space-y-3 rounded-lg border p-4 shadow-[inset_3px_0_0_currentColor]",
        SEVERITY_CLASS[block.severity],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline" className={SEVERITY_CLASS[block.severity]}>
              <AlertTriangleIcon />
              {block.severity.toUpperCase()}
            </Badge>
            {block.verified && (
              <Badge
                variant="secondary"
                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              >
                verified
              </Badge>
            )}
          </div>
          <h3 className="font-semibold text-base text-white">{block.title}</h3>
        </div>
        {block.location && (
          <span className="shrink-0 font-mono text-muted-foreground text-xs">
            {block.location.file}
            {block.location.line ? `:${block.location.line}` : ""}
          </span>
        )}
      </div>
      {block.body && <p className="text-sm leading-6 text-[#ded8e4]">{block.body}</p>}
      <EvidenceBlock rows={block.evidence} />
      {block.actions && (
        <div className="flex flex-wrap gap-2">
          {block.actions.map((action, index) => (
            <Button
              key={action}
              type="button"
              size="xs"
              variant={index === 0 ? "subtle" : "ghost"}
            >
              {action}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
