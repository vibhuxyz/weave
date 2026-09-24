import type { EmployeeEntry } from "@/features/employees";
import type { Agent } from "@/features/agents/hooks";

export type MenuAction = "edit" | "customize" | "duplicate" | "toggle-home" | "reset" | "delete";

export type CardAction = "view" | "chat" | MenuAction;

export function menuActionsFor(agent: Agent, entry: EmployeeEntry | undefined): readonly MenuAction[] {
  if (agent.origin.kind === "persona") return ["toggle-home", "delete"];
  if (!entry) return ["toggle-home"];
  if (entry.employee.source !== "project") return ["customize", "duplicate", "toggle-home"];
  return ["edit", "duplicate", "toggle-home", entry.overrides ? "reset" : "delete"];
}

export function menuLabel(action: MenuAction, options: { readonly isPinned: boolean }): string {
  switch (action) {
    case "edit":
      return "Edit";
    case "customize":
      return "Customize";
    case "duplicate":
      return "Duplicate";
    case "toggle-home":
      return options.isPinned ? "Remove from home" : "Add to home";
    case "reset":
      return "Reset to default";
    case "delete":
      return "Delete";
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function sourceLabel(agent: Agent, entry: EmployeeEntry | undefined): string {
  if (agent.origin.kind === "persona") return "Saved persona";
  if (entry?.overrides) return `Customized for this project (replaces the ${entry.overrides} employee)`;
  switch (agent.origin.source) {
    case "builtin":
      return "Built into Weave";
    case "user":
      return "From your employees folder";
    case "project":
      return "Saved in this project";
    default: {
      const exhaustive: never = agent.origin.source;
      return exhaustive;
    }
  }
}
