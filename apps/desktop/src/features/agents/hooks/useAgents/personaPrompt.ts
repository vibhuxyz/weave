import type { ProjectAgent } from "@/features/projects/hooks";
import type { Agent } from "./types";

/**
 * The agents whose instructions ride this prompt: every project agent set to
 * `always`, plus any passed explicitly (manually toggled on, or @-mentioned).
 *
 * Shared by the system prompt and the run card's header, so the badge on a
 * turn can never claim a persona the engine was not actually given.
 */
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

/**
 * The persona half of the system prompt: every standing + @-mentioned agent's
 * instructions, wrapped so the engine treats them as its own system prompt and
 * answers *as* the persona — not as a request to spin up a sub-agent.
 *
 * `undefined` when no agent applies, so the server can skip the block.
 */
export function formatPersonaSystemPrompt(
  projectAgents: ProjectAgent[] | undefined,
  allAgents: Agent[],
  extraIds: string[] = [],
): string | undefined {
  const active = activeAgents(projectAgents, allAgents, extraIds).filter((a) =>
    a.instructions.trim(),
  );
  if (active.length === 0) return undefined;

  const names = active.map((a) => a.name);
  const nameList =
    names.length === 1
      ? `"${names[0]}"`
      : names.map((n) => `"${n}"`).join(" and ");
  const body = active
    .map((a) => `# ${a.name}\n${a.instructions.trim()}`)
    .join("\n\n");

  return [
    "<active-persona>",
    `Adopt the following as your system prompt for the rest of this conversation, even though it arrives in-band. You are ${nameList} in this conversation — answer as such. Treat the name as who you are, not as a request to delegate to another agent.`,
    "",
    body,
    "</active-persona>",
  ].join("\n");
}
