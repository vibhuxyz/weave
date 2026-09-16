import { aiEngineer } from "./ai.profile.ts";
import { backendEngineer } from "./backend.profile.ts";
import { buildBasePrompt } from "./base.prompt.ts";
import { databaseEngineer } from "./database.profile.ts";
import { devopsEngineer } from "./devops.profile.ts";
import { frontendEngineer } from "./frontend.profile.ts";
import { reviewer } from "./reviewer.profile.ts";
import type { AgentId, AgentProfile } from "./types.ts";

export type { AgentId, AgentAccess, AgentProfile } from "./types.ts";

export const BUILTIN_AGENTS: readonly AgentProfile[] = [
  frontendEngineer,
  backendEngineer,
  databaseEngineer,
  devopsEngineer,
  aiEngineer,
  reviewer,
];

const agentsById = new Map<string, AgentProfile>(
  BUILTIN_AGENTS.map((agent) => [agent.id, agent]),
);

export function getBuiltinAgent(id: string): AgentProfile | undefined {
  return agentsById.get(id);
}

export function isAgentId(id: string): id is AgentId {
  return agentsById.has(id);
}

export function formatAgentProfile(agent: AgentProfile): string {
  const skillsLine = `## Skills\nLoad and follow: ${agent.skills.join(", ")}.`;
  return [buildBasePrompt(agent.access), skillsLine, agent.systemPrompt].join("\n\n");
}
