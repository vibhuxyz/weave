import { memo, useState } from "react";
import type { ToolEntry } from "@/features/chat/hooks";
import { cleanOutput } from "@/features/chat/components";
import { cn } from "@/shared/lib";
import { commandOf } from "../stream";
import { MAX_TASK_OUTPUT_CHARS } from "./constants";
import { TASK_KIND_LABEL, taskStateOf, type TaskState } from "./collect-tasks";

const STATE_LABEL = { running: "Running", completed: "Completed", failed: "Failed", stopped: "Stopped" } as const satisfies Record<TaskState, string>;
const STATE_CLASS = {
  running: "text-agent-progress-fg",
  completed: "text-agent-text-muted",
  failed: "text-agent-critical-fg",
  stopped: "text-agent-text-faint",
} as const satisfies Record<TaskState, string>;

function TaskCardView({ tool }: { readonly tool: ToolEntry }) {
  const [open, setOpen] = useState(false);
  const state = taskStateOf(tool);
  const text = tool.kind === "execute" ? commandOf(tool) : tool.title;
  const output = tool.output ? cleanOutput(tool.output).slice(0, MAX_TASK_OUTPUT_CHARS) : "";
  return (
    <li className="rounded-xl bg-agent-surface-hover">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full flex-col gap-2 px-4 py-3 text-left">
        <span className={cn("whitespace-pre-wrap break-all text-agent-text text-sm", !open && "line-clamp-6")}>{text}</span>
        <span className="flex gap-2 text-xs">
          <span className="text-agent-text-muted">{TASK_KIND_LABEL[tool.kind] ?? "Tool"}</span>
          <span className={STATE_CLASS[state]}>{STATE_LABEL[state]}</span>
        </span>
      </button>
      {open && output && (
        <pre className="mx-4 mb-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-agent-code-bg px-3 py-2 font-mono text-agent-text-muted text-xs">{output}</pre>
      )}
    </li>
  );
}

export const TaskCard = memo(TaskCardView);
