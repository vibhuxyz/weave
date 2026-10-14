import type { ToolEntry } from "@/features/chat/hooks";

const FOREIGN_NAME = /^(?:task|agent|subagent|spawn_subagent|spawn)$/i;

export function isForeignAgent(tool: ToolEntry): boolean {
  if (tool.planChange) return false;
  const head = tool.title.split(/[\s:(]/)[0] ?? "";
  if (FOREIGN_NAME.test(head) || /sub-?agent/i.test(tool.title)) return true;
  const input = tool.rawInput;
  if (typeof input !== "object" || input === null) return false;
  const name = "name" in input && typeof input.name === "string" ? input.name : "";
  return FOREIGN_NAME.test(name) || /sub-?agent/i.test(name);
}
