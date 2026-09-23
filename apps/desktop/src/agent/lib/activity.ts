import type { ChatTurn, ToolEntry } from "@/features/chat/hooks";
import { activeTitle, shorten } from "./toolTitle";

function isRunning(tool: ToolEntry): boolean {
  return !tool.interrupted && (tool.status === "in_progress" || tool.status === "pending");
}

/**
 * What the agent is doing right now, or `null` when there is nothing specific
 * to name. Callers already say "Working" themselves, so a generic fallback
 * here would render as "Working Working".
 */
export function currentActivity(turn: ChatTurn, projectDir: string | null): string | null {
  const tool = turn.tools.filter(isRunning).at(-1);
  if (tool) {
    return tool.kind === "think"
      ? `Exploring — ${shorten(tool.title, projectDir)}`
      : shorten(activeTitle(tool.title), projectDir);
  }
  return turn.thought.trim().length > 0 ? "Planning the next step" : null;
}
