import { cn } from "@/shared/lib";
import {
  PERCENT_SCALE,
  STILL_COMPACTING_AFTER_MS,
  compactionSummary,
  contextUsageRatio,
  failureDetail,
  formatCompactTokenCount,
  formatDuration,
  resultBarRuns,
  sweepBarRuns,
} from "../lib";
import type { CompactionNotice, CompactionStatus } from "../lib";
import { useElapsedMs, useSweepFrame } from "../hooks";
import { CompactionSummaryToggle } from "./CompactionSummaryToggle";
import { TextBar } from "./TextBar";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

const SETTLED_GLYPHS = { completed: "▣", failed: "✕", cancelled: "⊘" } as const;

const GLYPH_CLASS = {
  running: "text-agent-progress-fg",
  completed: "text-agent-success",
  failed: "text-destructive",
  cancelled: "text-agent-text-muted",
} as const satisfies Record<CompactionStatus, string>;

function title(notice: CompactionNotice, elapsedMs: number): string {
  switch (notice.status) {
    case "running":
      return elapsedMs >= STILL_COMPACTING_AFTER_MS ? "Still compacting…" : "Compacting conversation…";
    case "completed":
      if (notice.origin === "replay") return "Conversation compacted earlier";
      return notice.trigger === "automatic" ? "Compacted automatically" : "Conversation compacted";
    case "failed":
      return "Compaction failed";
    case "cancelled":
      return "Compaction cancelled";
    default: {
      const exhaustive: never = notice.status;
      return exhaustive;
    }
  }
}

function detail(notice: CompactionNotice): string | null {
  switch (notice.status) {
    case "running": {
      const before = notice.contextBefore;
      if (!before) return "Summarizing older turns";
      const percent = Math.round(contextUsageRatio(before) * PERCENT_SCALE);
      return `Summarizing ${formatCompactTokenCount(before.contextTokens)} tokens · ${percent}% of context`;
    }
    case "completed": {
      if (notice.origin === "replay") return "Older messages above were summarized for the engine";
      const summary = compactionSummary(notice);
      if (!summary) return "Older context was summarized";
      return `${summary.beforePercent}% → ${summary.afterPercent}% of context · ${formatCompactTokenCount(summary.freedTokens)} tokens freed`;
    }
    case "failed":
      return failureDetail(notice);
    case "cancelled":
      return notice.trigger === "automatic" ? "Your message was not sent and is back in the composer." : null;
    default: {
      const exhaustive: never = notice.status;
      return exhaustive;
    }
  }
}

function glyph(status: CompactionStatus, tick: number): string {
  if (status === "running") return SPINNER_FRAMES[tick % SPINNER_FRAMES.length] ?? SPINNER_FRAMES[0];
  return SETTLED_GLYPHS[status];
}

export function CompactionNoticeRow({ notice }: { readonly notice: CompactionNotice }) {
  const isRunning = notice.status === "running";
  const elapsedMs = useElapsedMs(notice.startedAt, notice.settledAt);
  const frame = useSweepFrame(isRunning);
  const summary = notice.status === "completed" ? compactionSummary(notice) : null;
  const runs = isRunning
    ? sweepBarRuns(frame.position)
    : summary
      ? resultBarRuns(summary.beforePercent, summary.afterPercent)
      : null;
  const detailText = detail(notice);
  const timer =
    notice.origin === "replay" ? null : isRunning ? formatDuration(elapsedMs) : `took ${formatDuration(elapsedMs)}`;

  return (
    <div role="status" aria-live="polite" className="mx-auto w-fit max-w-full font-mono text-[13px] leading-6">
      <div className="flex items-baseline justify-between gap-6">
        <span className="min-w-0 truncate text-agent-text-bright">
          <span className={GLYPH_CLASS[notice.status]} aria-hidden="true">
            {glyph(notice.status, frame.tick)}
          </span>{" "}
          {title(notice, elapsedMs)}
          {summary && <span className="text-agent-success"> · {summary.reductionPercent}% smaller</span>}
        </span>
        {timer && <span className="shrink-0 tabular-nums text-agent-text-muted">{timer}</span>}
      </div>
      {runs && <TextBar runs={runs} accent={isRunning ? "progress" : "success"} />}
      {detailText && (
        <p className={cn("max-w-[52ch] tabular-nums text-agent-text-muted", notice.status === "failed" && "text-destructive/80")}>
          {detailText}
        </p>
      )}
      {notice.summary && <CompactionSummaryToggle summary={notice.summary} />}
    </div>
  );
}
