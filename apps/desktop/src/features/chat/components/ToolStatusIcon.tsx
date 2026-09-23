import { CheckIcon, CircleSlashIcon, Loader2Icon, WrenchIcon, XIcon } from "lucide-react";
import { KIND_ICONS } from "@/agent/lib";
import type { ToolEntry } from "@/features/chat/hooks";

export type ToolRunState = "running" | "failed" | "interrupted" | "done";

export function toolRunState(tool: ToolEntry): ToolRunState {
  if (tool.interrupted) return "interrupted";
  if (tool.status === "in_progress" || tool.status === "pending") return "running";
  if (tool.status === "failed") return "failed";
  return "done";
}

export function ToolStatusIcon({ tool, state }: { tool: ToolEntry; state: ToolRunState }) {
  const Icon = KIND_ICONS[tool.kind] ?? WrenchIcon;

  if (state === "running") {
    return (
      <span className="relative flex size-3.5 shrink-0 items-center justify-center">
        <Loader2Icon className="absolute size-3.5 animate-spin text-agent-accent" />
        <Icon className="size-2.5 text-agent-accent" />
      </span>
    );
  }
  if (state === "failed") {
    return <XIcon className="size-3.5 shrink-0 text-agent-critical-fg" />;
  }
  if (state === "interrupted") {
    return <CircleSlashIcon className="size-3.5 shrink-0 text-agent-text-faint" />;
  }
  return (
    <span className="relative flex size-3.5 shrink-0 items-center justify-center">
      <Icon className="size-3.5 text-agent-text-muted" />
      <CheckIcon className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-agent-surface-base text-agent-success" />
    </span>
  );
}
