import { useState } from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  CircleIcon,
  ClockIcon,
  LayersIcon,
  Loader2Icon,
  TriangleAlertIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { TestRunBlock as TestRunBlockModel } from "../normalize/types";
import { CodePanel } from "./CodePanel";
import { cleanOutput } from "../../ToolSteps";

type Step = TestRunBlockModel["steps"][number];

function statusIcon(status: Step["status"]) {
  if (status === "completed") return CheckIcon;
  if (status === "failed") return XIcon;
  return CircleIcon;
}

function formatDuration(ms: number | undefined): string | null {
  if (ms == null) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const BADGE_TONE: Record<NonNullable<Step["badgeTone"]>, string> = {
  crit: "bg-agent-critical/15 text-agent-critical-fg",
  ok: "bg-agent-success-bg text-agent-success",
  warn: "bg-agent-warn-bg text-agent-warn",
  neutral: "bg-agent-surface-hover text-agent-text-muted",
};

/**
 * One stat in the run's summary row — an icon and a single line, sized to sit
 * four-across above the run log rather than as a stack of tall cards.
 */
function Chip({
  icon: Icon,
  label,
  tone = "neutral",
  iconClassName,
}: {
  icon: LucideIcon;
  label: string;
  tone?: "success" | "critical" | "running" | "neutral";
  iconClassName?: string;
}) {
  const iconClass =
    tone === "success"
      ? "text-agent-success"
      : tone === "critical"
        ? "text-agent-critical"
        : tone === "running"
          ? "text-agent-running"
          : "text-agent-progress-fg";
  return (
    <div className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-agent-border bg-agent-surface-inset px-2.5">
      <Icon className={cn("size-3.5 shrink-0", iconClass, iconClassName)} />
      <span className="truncate text-agent-text text-xs">{label}</span>
    </div>
  );
}

export function TestRunBlock({
  block,
  onSend,
}: {
  block: TestRunBlockModel;
  /** Lets the failure banner hand a follow-up prompt back to the agent. */
  onSend?: (text: string) => void;
}) {
  const failing = block.steps.filter((s) => s.status === "failed" || s.badgeTone === "crit").length;
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Long, all-green logs collapse by default; anything failing stays open.
  const failingAtMount = block.steps.some(
    (s) => s.status === "failed" || s.badgeTone === "crit",
  );
  const [listOpen, setListOpen] = useState(failingAtMount);

  const visibleSteps =
    problemsOnly && failing > 0
      ? block.steps.filter((s) => s.status === "failed" || s.badgeTone === "crit")
      : block.steps;

  const totalMs = block.steps.reduce((sum, s) => sum + (s.durationMs ?? 0), 0);
  const firstFailure = block.steps.find(
    (s) => s.status === "failed" || s.badgeTone === "crit",
  );
  const heading = block.title && block.title !== "Test run" ? block.title : "Run log";

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <section className="space-y-3">
      <div
        className={cn(
          "grid grid-cols-2 gap-2",
          totalMs > 0 ? "sm:grid-cols-4" : "sm:grid-cols-3",
        )}
      >
        <Chip
          icon={
            block.status === "passed"
              ? CheckIcon
              : block.status === "failed"
                ? CircleIcon
                : Loader2Icon
          }
          iconClassName={block.status === "failed" ? "fill-current" : undefined}
          label={block.status[0].toUpperCase() + block.status.slice(1)}
          tone={
            block.status === "passed"
              ? "success"
              : block.status === "failed"
                ? "critical"
                : "running"
          }
        />
        <Chip
          icon={LayersIcon}
          label={`${block.steps.length} step${block.steps.length === 1 ? "" : "s"}`}
        />
        <Chip
          icon={TriangleAlertIcon}
          label={`${failing} problem${failing === 1 ? "" : "s"}`}
          tone={failing > 0 ? "critical" : "neutral"}
        />
        {totalMs > 0 && (
          <Chip icon={ClockIcon} label={formatDuration(totalMs) ?? ""} />
        )}
      </div>

      {/* A failure is a prompt for the next action, not just a red row. */}
      {failing > 0 && onSend && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-agent-critical/40 bg-agent-critical-bg px-3 py-2.5">
          <p className="min-w-0 flex-1 text-agent-text-bright text-xs">
            {firstFailure
              ? `${firstFailure.label} failed.`
              : `${failing} step${failing === 1 ? "" : "s"} failed.`}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onSend(
                  firstFailure
                    ? `Retry the failed step: ${firstFailure.label}`
                    : "Retry the failed steps.",
                )
              }
              className="rounded-lg border border-agent-border bg-agent-surface-hover px-2.5 py-1 text-agent-text text-xs transition-colors duration-150 ease-out hover:text-agent-text-bright"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() =>
                onSend(
                  firstFailure
                    ? `The step "${firstFailure.label}" failed. Diagnose the failure and fix it.`
                    : "Diagnose the failed steps and fix them.",
                )
              }
              className="rounded-lg border border-agent-border bg-agent-surface-hover px-2.5 py-1 text-agent-text text-xs transition-colors duration-150 ease-out hover:text-agent-text-bright"
            >
              Fix automatically
            </button>
          </div>
        </div>
      )}

      {/* Hairline between the metrics and the log, as in the reference. */}
      <div className="space-y-1.5 border-agent-border border-t pt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              className="flex items-center gap-1.5 text-agent-text-strong text-sm transition-colors hover:text-agent-text-bright"
            >
              <ChevronRightIcon
                className={cn(
                  "size-4 transition-transform duration-150",
                  listOpen && "rotate-90",
                )}
              />
              {heading}
            </button>
            {failing > 0 && listOpen && (
              <div className="flex rounded-md border border-agent-border bg-agent-code-bg p-0.5 font-mono text-[10px]">
                {(
                  [
                    ["All steps", false],
                    ["Problems only", true],
                  ] as const
                ).map(([label, on]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setProblemsOnly(on)}
                    className={cn(
                      "rounded-sm px-2 py-0.5 transition-colors",
                      problemsOnly === on
                        ? "bg-agent-surface-hover text-agent-text-bright"
                        : "text-agent-text-faint hover:text-agent-text-strong",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-agent-text-faint text-xs">
            {failing} failing · {block.steps.length} steps
            {totalMs > 0 && ` · ${formatDuration(totalMs)}`}
          </span>
        </div>

        {listOpen && (
        <div className="space-y-1">
          {visibleSteps.map((step) => {
            const Icon = statusIcon(step.status);
            const isExpanded = expandedIds.has(step.id);
            const duration = formatDuration(step.durationMs);
            const failed = step.status === "failed" || step.badgeTone === "crit";

            return (
              <div key={step.id} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => toggleExpand(step.id)}
                  className={cn(
                    "flex h-12 w-full items-center gap-3 rounded-xl border border-agent-border bg-agent-surface-inset px-3.5 text-left text-xs transition-colors duration-150 ease-out hover:bg-agent-surface-hover",
                    failed && "border-agent-critical/50 bg-agent-critical-bg hover:bg-agent-critical-bg",
                    isExpanded && "rounded-b-none border-b-transparent",
                  )}
                >
                  <ChevronRightIcon
                    className={cn(
                      "size-4 shrink-0 text-agent-text-faint transition-transform duration-150",
                      isExpanded && "rotate-90",
                    )}
                  />
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      step.status === "completed" && !failed && "text-agent-success",
                      failed && "text-agent-critical-fg",
                      (step.status === "pending" || step.status === "in_progress") &&
                        "text-agent-text-muted",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-agent-text-bright text-sm">
                    {step.label}
                  </span>
                  {step.badge && (
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]",
                        BADGE_TONE[step.badgeTone ?? "neutral"],
                      )}
                    >
                      {step.badge}
                    </span>
                  )}
                  {duration && (
                    <span className="shrink-0 font-mono text-[11px] text-agent-text-faint tabular-nums">
                      {duration}
                    </span>
                  )}
                </button>

                {isExpanded && (() => {
                  const clean = step.output ? cleanOutput(step.output) : "";
                  return (
                  <div className="rounded-b-xl border border-t-0 border-agent-border">
                    {clean ? (
                      <CodePanel
                        code={clean}
                        copyable
                        className="rounded-none border-0"
                      />
                    ) : (
                      <div className="bg-agent-code-bg px-4 py-3">
                        <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-agent-text-muted">
                          <span className="text-agent-success">$</span>{" "}
                          <span className="text-agent-text-strong">{step.label}</span>
                          {"\n"}
                          <span className="text-agent-text-muted/60"># status: {step.status}</span>
                        </pre>
                      </div>
                    )}
                  </div>
                  );
                })()}
              </div>
            );
          })}

          {visibleSteps.length === 0 && (
            <p className="py-4 text-center font-mono text-xs text-agent-text-muted">
              No problems found.
            </p>
          )}
        </div>
        )}
      </div>
    </section>
  );
}
