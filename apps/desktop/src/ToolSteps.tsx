import { useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/shared/ui/ai-elements/task";
import { Shimmer } from "@/shared/ui/ai-elements/shimmer";
import { cn } from "@/shared/lib/cn";
import { formatElapsed, useNow } from "./agent/lib/elapsed";
import { KIND_ICONS, activeTitle, shorten } from "./agent/lib/toolTitle";
import type { ToolEntry } from "./useAcpChat";

/** A running command past this many seconds is probably stuck — nudge the user. */
const SLOW_AFTER_S = 60;

function isRunning(tool: ToolEntry) {
  return tool.status === "in_progress" || tool.status === "pending";
}

/**
 * agy-acp wraps shell output in a JSON envelope + task/log metadata. Strip that
 * so the panel shows real stdout, not the engine's bookkeeping.
 */
export function cleanOutput(raw: string): string {
  let out = raw;
  // Leading ```{ … }``` JSON envelope, optionally followed by an echoed command.
  out = out.replace(/^\s*```[\s\S]*?```/, "");
  out = out
    .split("\n")
    .filter((line) => !/^\s*(Task|Log):\s/.test(line))
    .join("\n");
  return out.trim();
}

function ToolRow({
  tool,
  projectDir,
  onStop,
}: {
  tool: ToolEntry;
  projectDir: string | null;
  onStop?: () => void;
}) {
  // Claude Code reports a spawned sub-agent (Task tool) as `kind: "think"`.
  // Its streamed output is "what the sub-agent is exploring" — keep it open so
  // the user can watch it rather than staring at a collapsed row.
  const isSubagent = tool.kind === "think";
  const [open, setOpen] = useState(isSubagent);
  const Icon = KIND_ICONS[tool.kind] ?? WrenchIcon;
  const running = isRunning(tool);
  const failed = tool.status === "failed";
  const isShell = tool.kind === "execute";

  const now = useNow(running);
  const elapsedMs =
    tool.startedAt != null
      ? (running ? now : tool.endedAt ?? now) - tool.startedAt
      : null;
  const slow = running && elapsedMs != null && elapsedMs > SLOW_AFTER_S * 1000;

  const cleaned = tool.output ? cleanOutput(tool.output) : "";
  const hasLog = cleaned.length > 0;
  // A running shell command or sub-agent is what the user most wants to watch.
  const highlight = (isShell || isSubagent) && running;

  const tone = failed
    ? "text-agent-critical-fg"
    : running
      ? "text-agent-text-bright"
      : "text-agent-text-muted";

  return (
    <div
      className={cn(
        "rounded-lg",
        highlight &&
          (slow
            ? "border border-agent-warn/50 bg-agent-warn-bg"
            : "border border-agent-accent/40 bg-agent-accent-wash"),
      )}
    >
      <TaskItem className={cn("flex items-center gap-2", highlight && "px-2.5 py-2")}>
        {running ? (
          <span className="relative flex size-3.5 shrink-0 items-center justify-center">
            <Loader2Icon className="absolute size-3.5 animate-spin text-agent-accent" />
            <Icon className="size-2.5 text-agent-accent" />
          </span>
        ) : failed ? (
          <XIcon className="size-3.5 shrink-0 text-agent-critical-fg" />
        ) : (
          <span className="relative flex size-3.5 shrink-0 items-center justify-center">
            <Icon className="size-3.5 text-agent-text-muted" />
            <CheckIcon className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-agent-surface-base text-agent-success" />
          </span>
        )}
        <button
          type="button"
          disabled={!hasLog}
          onClick={() => setOpen((v) => !v)}
          className={cn("flex min-w-0 flex-1 items-center gap-1.5 text-left", tone)}
          title={tool.title}
        >
          {running ? (
            <Shimmer className="min-w-0 truncate">
              {isSubagent
                ? `Exploring — ${shorten(tool.title, projectDir)}`
                : shorten(activeTitle(tool.title), projectDir)}
            </Shimmer>
          ) : (
            <span className="truncate">
              {isSubagent
                ? `Explored — ${shorten(tool.title, projectDir)}`
                : shorten(tool.title, projectDir)}
            </span>
          )}
          <ChevronRightIcon
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              hasLog ? "opacity-50" : "opacity-30",
              open && "rotate-90",
            )}
          />
        </button>

        {elapsedMs != null && (running || isShell) && (
          <span
            className={cn(
              "shrink-0 font-mono text-[11px] tabular-nums",
              slow ? "text-agent-warn" : "text-agent-text-faint",
            )}
          >
            {formatElapsed(elapsedMs)}
          </span>
        )}

        {isShell && running && onStop && (
          <button
            type="button"
            onClick={onStop}
            className={cn(
              "shrink-0 rounded-md border px-2 py-0.5 text-xs transition-colors",
              slow
                ? "border-agent-warn/50 bg-agent-warn-bg text-agent-warn hover:bg-agent-warn/20"
                : "border-agent-border bg-agent-surface-hover text-agent-text hover:bg-agent-surface-raised",
            )}
          >
            Stop
          </button>
        )}
      </TaskItem>

      {slow && (
        <p className="px-2.5 pb-2 text-agent-warn text-[11px]">
          Running for {formatElapsed(elapsedMs!)} — stop it and check the command
          if this looks stuck.
        </p>
      )}

      {open && hasLog && (
        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-agent-code-bg p-2.5 font-mono text-agent-text-muted text-[11px] leading-relaxed">
          {cleaned}
        </pre>
      )}
    </div>
  );
}

/**
 * Renders what the agent is doing: finished work folds into one "N previous
 * steps" line, and whatever is running stays visible with a live timer.
 */
export function ToolSteps({
  tools,
  projectDir,
  onStop,
}: {
  tools: ToolEntry[];
  projectDir: string | null;
  onStop?: () => void;
}) {
  if (tools.length === 0) return null;

  const done = tools.filter(
    (tool) => tool.status === "completed" || tool.status === "failed",
  );
  const active = tools.filter(isRunning);

  return (
    <div className="flex flex-col gap-2">
      {done.length > 0 && (
        <Task defaultOpen={false}>
          <TaskTrigger title="">
            <div className="flex cursor-pointer items-center gap-2 text-agent-text-muted text-sm transition-colors hover:text-agent-text-bright">
              <span>
                {done.length} previous step{done.length === 1 ? "" : "s"}
              </span>
              <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
            </div>
          </TaskTrigger>
          <TaskContent>
            {done.map((tool) => (
              <ToolRow key={tool.id} tool={tool} projectDir={projectDir} />
            ))}
          </TaskContent>
        </Task>
      )}

      {active.map((tool) => (
        <ToolRow
          key={tool.id}
          tool={tool}
          projectDir={projectDir}
          onStop={onStop}
        />
      ))}
    </div>
  );
}
