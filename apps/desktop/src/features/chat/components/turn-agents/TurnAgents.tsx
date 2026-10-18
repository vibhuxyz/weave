import { AgentAvatar } from "@/features/agents/components";
import { useEmployeeListing, type EmployeeListing } from "@/features/employees";
import type { TurnPersona } from "@/features/chat/hooks";
import { cn } from "@/shared/lib";
import { MAX_VISIBLE_TURN_AGENTS } from "./constants";

export function TurnAgents({
  agents,
  skills,
  label,
  align = "start",
}: {
  readonly agents: readonly TurnPersona[] | undefined;
  readonly skills?: readonly string[];
  readonly label: string;
  readonly align?: "start" | "end";
}) {
  const listing = useEmployeeListing();
  const employees = (agents ?? []).filter((agent) => agent.kind === "employee");
  const personas = (agents ?? []).filter((agent) => agent.kind !== "employee");
  const skillNames = skills ?? [];
  if (employees.length + personas.length + skillNames.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-1", align === "end" && "items-end")} aria-label={label}>
      <span className="text-[11px] text-agent-text-muted">{label}</span>
      <AgentGroup label="Employees" agents={employees} listing={listing} align={align} />
      <AgentGroup label="Agents" agents={personas} listing={listing} align={align} />
      <SkillGroup names={skillNames} align={align} />
    </div>
  );
}

function AgentGroup({
  label,
  agents,
  listing,
  align,
}: {
  readonly label: string;
  readonly agents: readonly TurnPersona[];
  readonly listing: EmployeeListing;
  readonly align: "start" | "end";
}) {
  if (agents.length === 0) return null;
  const visible = agents.slice(0, MAX_VISIBLE_TURN_AGENTS);
  const hidden = agents.length - visible.length;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", align === "end" && "justify-end")}>
      <span className="text-[10px] text-muted-foreground">{label}</span>
      {visible.map((agent) => (
        <AgentChip key={agent.id} agent={agent} listing={listing} />
      ))}
      {hidden > 0 && <span className="text-[11px] text-agent-text-faint">(+{hidden} more)</span>}
    </div>
  );
}

function SkillGroup({ names, align }: { readonly names: readonly string[]; readonly align: "start" | "end" }) {
  if (names.length === 0) return null;
  const visible = names.slice(0, MAX_VISIBLE_TURN_AGENTS);
  const hidden = names.length - visible.length;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", align === "end" && "justify-end")}>
      <span className="text-[10px] text-muted-foreground">Skills</span>
      {visible.map((name) => (
        <span key={name} className="inline-flex max-w-full items-center rounded-md bg-secondary/70 px-1.5 py-0.5">
          <span className="max-w-36 truncate text-xs text-foreground">{name}</span>
        </span>
      ))}
      {hidden > 0 && <span className="text-[11px] text-agent-text-faint">(+{hidden} more)</span>}
    </div>
  );
}

function AgentChip({ agent, listing }: { readonly agent: TurnPersona; readonly listing: EmployeeListing }) {
  const name = displayName(agent, listing);
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-secondary/70 py-0.5 pr-1.5 pl-1" title={name}>
      <AgentAvatar name={name} seed={agent.id} icon={agent.icon} character={agent.character} size="xs" className="size-4 shrink-0" />
      <span className="max-w-36 truncate text-xs text-foreground">{name}</span>
    </span>
  );
}

function displayName(agent: TurnPersona, listing: EmployeeListing): string {
  if (agent.kind !== "employee" || listing.status !== "ready") return agent.name;
  return listing.entries.find((entry) => entry.employee.id === agent.id)?.employee.name ?? agent.name;
}
