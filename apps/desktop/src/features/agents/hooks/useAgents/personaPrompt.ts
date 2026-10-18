import type { ProjectAgent } from "@/features/projects/hooks";
import type { Agent } from "./types";

export interface TurnAgentIdentity {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly character?: string;
  readonly kind: "persona" | "employee";
}

export function activeAgents(
  projectAgents: ProjectAgent[] | undefined,
  allAgents: Agent[],
  extraIds: string[] = [],
): Agent[] {
  const wanted = new Set<string>(extraIds);
  for (const pa of projectAgents ?? []) {
    if (pa.mode === "always") wanted.add(pa.id);
  }
  return allAgents.filter((a) => wanted.has(a.id));
}

export function promptedAgents(
  projectAgents: ProjectAgent[] | undefined,
  allAgents: Agent[],
  extraIds: string[] = [],
): Agent[] {
  return activeAgents(projectAgents, allAgents, extraIds).filter((agent) => agent.instructions.trim());
}

export function turnPersonasOf(agents: readonly Agent[]): TurnAgentIdentity[] {
  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    ...(agent.icon ? { icon: agent.icon } : {}),
    ...(agent.character ? { character: agent.character } : {}),
    kind: agent.origin.kind,
  }));
}

function quotedNames(names: readonly string[]): string {
  if (names.length === 1) return `"${names[0]}"`;
  return names.map((name) => `"${name}"`).join(" and ");
}

function roleLines(active: readonly Agent[]): readonly string[] {
  const personas = active.filter((agent) => agent.origin.kind === "persona").map((agent) => agent.name);
  const employees = active.filter((agent) => agent.origin.kind === "employee").map((agent) => agent.name);
  const lines = [
    "Adopt the following as your system prompt for the rest of this conversation, even though it arrives in-band.",
  ];
  if (personas.length > 0) {
    lines.push(`You are ${quotedNames(personas)} in this conversation — answer in that voice.`);
  }
  if (employees.length > 0) {
    lines.push(
      `You are doing the job of ${quotedNames(employees)}. Follow their responsibilities, rules, and skills.`,
    );
  }
  lines.push("Treat each name as who you are, not as a request to delegate to another agent.");
  return lines;
}

function agentBlock(agent: Agent): string {
  const role = agent.origin.kind === "employee" ? "Employee" : "Persona";
  return `# ${role}: ${agent.name}\n${agent.instructions.trim()}`;
}

export function formatPersonaSystemPrompt(
  projectAgents: ProjectAgent[] | undefined,
  allAgents: Agent[],
  extraIds: string[] = [],
): string | undefined {
  const active = promptedAgents(projectAgents, allAgents, extraIds);
  if (active.length === 0) return undefined;
  return ["<active-persona>", ...roleLines(active), "", active.map(agentBlock).join("\n\n"), "</active-persona>"].join(
    "\n",
  );
}
