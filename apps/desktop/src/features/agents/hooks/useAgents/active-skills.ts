import type { Agent } from "./types";

export const MAX_PINNED_SKILLS = 24;

export function skillNamesOf(agents: readonly Agent[]): string[] {
  const names = new Set(agents.flatMap((agent) => agent.skills ?? []));
  return [...names].sort().slice(0, MAX_PINNED_SKILLS);
}
