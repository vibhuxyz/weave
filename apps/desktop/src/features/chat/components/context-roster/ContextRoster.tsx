import { useState } from "react";
import { AgentAvatar, ProjectAgentsPicker } from "@/features/agents/components";
import type { Agent } from "@/features/agents/hooks";
import type { ProjectAgent } from "@/features/projects/hooks";
import { cn } from "@/shared/lib";

interface ContextRosterProps {
  readonly agents: readonly Agent[];
  readonly projectAgents: readonly ProjectAgent[];
  readonly onProjectAgentsChange: (next: ProjectAgent[]) => void;
  readonly manualActive: readonly string[];
  readonly onToggleManual: (id: string) => void;
}

interface RosterCopy {
  readonly title: string;
  readonly addLabel: string;
  readonly emptyLabel: string;
  readonly unavailableLabel: string;
}

const PERSONA_COPY: RosterCopy = {
  title: "Personas",
  addLabel: "Add personas",
  emptyLabel: "No personas on this project.",
  unavailableLabel: "No personas yet.",
};

const EMPLOYEE_COPY: RosterCopy = {
  title: "Employees",
  addLabel: "Add employees",
  emptyLabel: "No employees on this project.",
  unavailableLabel: "No employees yet.",
};

export function ContextRoster({ agents, projectAgents, onProjectAgentsChange, manualActive, onToggleManual }: ContextRosterProps) {
  const shared = { projectAgents, onProjectAgentsChange, manualActive, onToggleManual };
  return (
    <>
      <RosterSection copy={PERSONA_COPY} agents={agents.filter((agent) => agent.origin.kind === "persona")} {...shared} />
      <RosterSection copy={EMPLOYEE_COPY} agents={agents.filter((agent) => agent.origin.kind === "employee")} {...shared} />
    </>
  );
}

function RosterSection({ copy, agents, projectAgents, onProjectAgentsChange, manualActive, onToggleManual }: { readonly copy: RosterCopy; readonly agents: readonly Agent[] } & Omit<ContextRosterProps, "agents">) {
  const [isEditing, setEditing] = useState(false);
  const grouped = groupedAttached(agents, projectAgents);
  const isAdd = !isEditing && grouped.always.length + grouped.manual.length === 0;
  const action = isEditing ? "Done" : isAdd ? copy.addLabel : "Edit";
  return (
    <>
      <RosterHeader title={copy.title} action={action} isPrimary={isAdd} onToggle={() => setEditing((value) => !value)} />
      <RosterBody
        isEditing={isEditing}
        copy={copy}
        agents={agents}
        grouped={grouped}
        projectAgents={projectAgents}
        onProjectAgentsChange={onProjectAgentsChange}
        manualActive={manualActive}
        onToggleManual={onToggleManual}
      />
    </>
  );
}

function RosterHeader({ title, action, isPrimary, onToggle }: { readonly title: string; readonly action: string; readonly isPrimary: boolean; readonly onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-muted-foreground text-xs">{title}</p>
      <button
        type="button"
        onClick={onToggle}
        className={cn("text-xs transition-colors", isPrimary ? "font-medium text-primary hover:text-primary/80" : "text-muted-foreground hover:text-foreground")}
      >
        {action}
      </button>
    </div>
  );
}

function RosterBody({ isEditing, copy, agents, grouped, projectAgents, onProjectAgentsChange, manualActive, onToggleManual }: { readonly isEditing: boolean; readonly copy: RosterCopy; readonly agents: readonly Agent[]; readonly grouped: GroupedAgents; readonly projectAgents: readonly ProjectAgent[]; readonly onProjectAgentsChange: (next: ProjectAgent[]) => void; readonly manualActive: readonly string[]; readonly onToggleManual: (id: string) => void }) {
  if (isEditing) {
    if (agents.length === 0) return <p className="text-muted-foreground text-xs">{copy.unavailableLabel}</p>;
    return <ProjectAgentsPicker agents={[...agents]} value={[...projectAgents]} onChange={onProjectAgentsChange} compact />;
  }
  if (grouped.always.length + grouped.manual.length === 0) return <p className="text-muted-foreground text-xs">{copy.emptyLabel}</p>;
  return <AttachedList always={grouped.always} manual={grouped.manual} manualActive={manualActive} onToggleManual={onToggleManual} />;
}

interface GroupedAgents {
  readonly always: readonly Agent[];
  readonly manual: readonly Agent[];
}

function groupedAttached(agents: readonly Agent[], projectAgents: readonly ProjectAgent[]): GroupedAgents {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const always: Agent[] = [];
  const manual: Agent[] = [];
  for (const entry of projectAgents) {
    const agent = byId.get(entry.id);
    if (agent === undefined) continue;
    if (entry.mode === "always") always.push(agent);
    else manual.push(agent);
  }
  return { always, manual };
}

function AttachedList({ always, manual, manualActive, onToggleManual }: { readonly always: readonly Agent[]; readonly manual: readonly Agent[]; readonly manualActive: readonly string[]; readonly onToggleManual: (id: string) => void }) {
  const active = new Set(manualActive);
  return (
    <div className="flex flex-col gap-1">
      {always.map((agent) => <AlwaysRow key={agent.id} agent={agent} />)}
      {manual.map((agent) => <ManualRow key={agent.id} agent={agent} isOn={active.has(agent.id)} onToggle={() => onToggleManual(agent.id)} />)}
    </div>
  );
}

function rowLabel(mode: string, agent: Agent): string {
  const count = agent.skills?.length ?? 0;
  return count === 0 ? mode : `${mode} · ${count} ${count === 1 ? "skill" : "skills"}`;
}

function AgentFace({ agent }: { readonly agent: Agent }) {
  return (
    <AgentAvatar name={agent.name} seed={agent.id} tint={agent.tint} icon={agent.icon} character={agent.character} size="sm" className="size-6 shrink-0" />
  );
}

function AlwaysRow({ agent }: { readonly agent: Agent }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-secondary/70 px-2.5 py-1.5">
      <AgentFace agent={agent} />
      <span className="min-w-0 flex-1 truncate text-xs">{agent.name}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">{rowLabel("always", agent)}</span>
    </div>
  );
}

function ManualRow({ agent, isOn, onToggle }: { readonly agent: Agent; readonly isOn: boolean; readonly onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors", isOn ? "bg-agent-accent-wash text-foreground" : "bg-secondary/70 text-muted-foreground hover:text-foreground")}
    >
      <AgentFace agent={agent} />
      <span className="min-w-0 flex-1 truncate text-xs">{agent.name}</span>
      <span className={cn("shrink-0 text-[10px]", isOn ? "text-agent-accent" : "text-muted-foreground")}>{rowLabel(isOn ? "on · next chat" : "manual", agent)}</span>
    </button>
  );
}
