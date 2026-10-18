import type { Agent } from "@/features/agents/hooks";
import type { SkillView } from "@/features/skills/types";
import { MAX_MENTION_RESULTS } from "./constants";

function matchesQuery(name: string, query: string): boolean {
  if (query === "") return true;
  return name.toLowerCase().includes(query.toLowerCase());
}

function take<T>(items: readonly T[]): T[] {
  return items.slice(0, MAX_MENTION_RESULTS);
}

export function matchingAgents(
  agents: readonly Agent[],
  kind: "employee" | "persona",
  query: string,
  takenIds: ReadonlySet<string>,
): Agent[] {
  return take(
    agents.filter(
      (agent) =>
        agent.origin.kind === kind &&
        !takenIds.has(agent.id) &&
        matchesQuery(agent.name, query),
    ),
  );
}

export function matchingSkills(
  skills: readonly SkillView[],
  query: string,
  takenNames: ReadonlySet<string>,
): SkillView[] {
  return take(
    skills.filter((skill) => !takenNames.has(skill.name) && matchesQuery(skill.name, query)),
  );
}
