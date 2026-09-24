import type { EmployeeEntry } from "@/features/employees";
import type { Agent } from "@/features/agents/hooks";
import { Badge } from "@/shared/ui";

function badgeText(agent: Agent, entry: EmployeeEntry | undefined): string {
  if (agent.origin.kind === "persona") return "Persona";
  if (entry?.overrides) return "Customized";
  switch (agent.origin.source) {
    case "builtin":
      return "Built-in";
    case "user":
      return "Yours";
    case "project":
      return "This project";
    default: {
      const exhaustive: never = agent.origin.source;
      return exhaustive;
    }
  }
}

export function SourceBadge({ agent, entry }: { readonly agent: Agent; readonly entry: EmployeeEntry | undefined }) {
  return (
    <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px] font-medium">
      {badgeText(agent, entry)}
    </Badge>
  );
}
