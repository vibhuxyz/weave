import type { TurnPersona } from "@/features/chat/hooks";

export function mentionedTurnAgents(
  personas: readonly TurnPersona[] | undefined,
  mentions: readonly string[] | undefined,
): TurnPersona[] {
  if (mentions === undefined || mentions.length === 0) return [];
  const wanted = new Set(mentions);
  const matched = (personas ?? []).filter((agent) => wanted.has(agent.name) || wanted.has(agent.id));
  if (matched.length > 0) return matched;
  return mentions.map((name) => ({ id: name, name }));
}
