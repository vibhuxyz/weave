import type { ChatTurn, ToolEntry } from "@/features/chat/hooks";

export type TaskState = "running" | "completed" | "failed" | "stopped";

export interface TaskList {
  readonly running: readonly ToolEntry[];
  readonly finished: readonly ToolEntry[];
}

export const TASK_KIND_LABEL: Readonly<Record<string, string>> = {
  execute: "Bash",
  read: "Read",
  edit: "Edit",
  delete: "Delete",
  move: "Move",
  search: "Search",
  fetch: "Fetch",
  think: "Agent",
};

export function taskStateOf(tool: ToolEntry): TaskState {
  if (tool.interrupted) return "stopped";
  if (tool.status === "pending" || tool.status === "in_progress") return "running";
  return tool.status === "failed" ? "failed" : "completed";
}

export function collectTasks(turns: readonly Pick<ChatTurn, "tools">[]): TaskList {
  const newestFirst = turns.flatMap((turn) => turn.tools.filter((tool) => !tool.planChange)).reverse();
  return {
    running: newestFirst.filter((tool) => taskStateOf(tool) === "running"),
    finished: newestFirst.filter((tool) => taskStateOf(tool) !== "running"),
  };
}
