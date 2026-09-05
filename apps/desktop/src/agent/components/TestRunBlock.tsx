import { useState } from "react";
import { CheckIcon, ChevronRightIcon, CircleIcon, XIcon } from "lucide-react";
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

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "critical" | "running" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "border-agent-success/25 bg-agent-success-bg text-agent-success"
      : tone === "critical"
        ? "border-agent-critical/25 bg-agent-critical-bg text-agent-critical-fg"
        : tone === "running"
          ? "border-agent-running/25 bg-agent-running-bg text-agent-running"
          : "border-agent-border bg-agent-surface-inset text-agent-text-muted";
  return (
    <div className={cn("rounded-lg border p-4", toneClass)}>
      <p className="font-mono text-[11px] uppercase tracking-[0.08em]">{label}</p>
      <p className="mt-2 font-mono text-sm text-agent-text-bright">{value}</p>
    </div>
  );
}

export function TestRunBlock({ block }: { block: TestRunBlockModel }) {
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
  const heading = block.title && block.title !== "Test run" ? block.title : "Run log";

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          label="Status"
          value={block.status}
          tone={
            block.status === "passed"
              ? "success"
              : block.status === "failed"
                ? "critical"
                : "running"
          }
        />
        <Tile label="Steps" value={`${block.steps.length}`} tone="neutral" />
        <Tile
          label="Problems"
          value={`${failing}`}
          tone={failing > 0 ? "critical" : "neutral"}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              className="flex items-center gap-1.5 font-mono text-agent-text-muted text-[11px] uppercase tracking-[0.08em] transition-colors hover:text-agent-text-strong"
            >
              <ChevronRightIcon
                className={cn(
                  "size-3 transition-transform",
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
          <span className="font-mono text-agent-text-muted text-xs">
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
                    "flex w-full items-center gap-3 rounded-lg border border-agent-border bg-agent-surface-inset px-3 py-2 font-mono text-xs text-left transition-colors hover:bg-agent-surface-hover",
                    failed && "border-agent-critical/50 bg-agent-critical-bg hover:bg-agent-critical-bg",
                    isExpanded && "rounded-b-none border-b-transparent",
                  )}
                >
                  <ChevronRightIcon
                    className={cn(
                      "size-3 shrink-0 text-agent-text-muted transition-transform duration-150",
                      isExpanded && "rotate-90",
                    )}
                  />
                  <Icon
                    className={cn(
                      "size-3.5 shrink-0",
                      step.status === "completed" && !failed && "text-agent-success",
                      failed && "text-agent-critical-fg",
                      (step.status === "pending" || step.status === "in_progress") &&
                        "text-agent-text-muted",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-agent-text-strong">
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
                    <span className="shrink-0 font-mono text-[10px] text-agent-text-muted/70 tabular-nums">
                      {duration}
                    </span>
                  )}
                </button>

                {isExpanded && (() => {
                  const clean = step.output ? cleanOutput(step.output) : "";
                  return (
                  <div className="rounded-b-lg border border-t-0 border-agent-border">
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
