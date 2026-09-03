import { CopyIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import type { AgentRunMeta } from "../normalize/types";

function formatDuration(ms?: number): string | null {
  if (!ms) return null;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function AgentHeader({
  meta,
  onCopy,
}: {
  meta: AgentRunMeta;
  onCopy?: () => void;
}) {
  const details = [
    meta.model,
    formatDuration(meta.durationMs),
    `${meta.filesChanged} file${meta.filesChanged === 1 ? "" : "s"}`,
    meta.usage?.used ? `${(meta.usage.used / 1000).toFixed(1)}k tokens` : null,
    meta.usage?.costUsd ? `$${meta.usage.costUsd.toFixed(2)}` : null,
  ].filter(Boolean);

  return (
    <div className="flex items-center justify-between gap-3 border-white/10 border-b bg-[#191922] px-5 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-[#f0845d] text-[#1b1110]">
          <SparklesIcon className="size-3.5" />
        </span>
        <span className="shrink-0 font-medium text-sm">{meta.engineLabel}</span>
        {details.length > 0 && (
          <Badge
            variant="secondary"
            className="min-w-0 max-w-[22rem] truncate border-[#383341] bg-[#24232d] font-mono text-[#a8a2b3]"
          >
            {details.join(" · ")}
          </Badge>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="hidden rounded-md border border-white/10 bg-[#111118] p-0.5 text-xs sm:flex">
          {["Brief", "Normal", "Deep"].map((label) => (
            <span
              key={label}
              className={
                label === "Normal"
                  ? "rounded-sm bg-[#343141] px-2.5 py-1 text-white"
                  : "px-2.5 py-1 text-[#8e8b98]"
              }
            >
              {label}
            </span>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onCopy}
          leftIcon={<CopyIcon />}
        >
          copy
        </Button>
      </div>
    </div>
  );
}
