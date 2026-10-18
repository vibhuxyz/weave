import { EMPLOYEE_ID_PATTERN } from "@weave/core/browser";
import { idFromName } from "@/features/employees";
import type { Agent } from "../hooks/useAgents/types";
import { BUILTIN_PERSONAS } from "./builtins";
import type { PersonaDraft } from "./types";

const PERSONA_CHARACTER_PATTERN = /^(?:fuzzies|gloopies|pollies)-(?:1|4|5|7|9|10|13|16|17|21)$/;

export function personaIssue(
  draft: PersonaDraft,
  takenIds: ReadonlySet<string>,
  takenCharacters: ReadonlySet<string>,
): string | null {
  const name = draft.name.trim();
  const id = idFromName(name);
  if (!name) return "Give the persona a name.";
  if (!draft.description.trim()) return "Say what this persona is for.";
  if (!draft.instructions.trim()) return "Say how this persona makes the agent work.";
  if (!EMPLOYEE_ID_PATTERN.test(id)) return "Use a name that starts with a letter.";
  if (takenIds.has(id)) return "An employee or persona already uses that name.";
  const character = draft.character.trim();
  if (!PERSONA_CHARACTER_PATTERN.test(character)) return "Choose an avatar.";
  if (takenCharacters.has(character)) return "Another persona or employee already uses that avatar.";
  return null;
}

function personaCharacter(character: string): string | undefined {
  const key = character.trim();
  return PERSONA_CHARACTER_PATTERN.test(key) ? key : undefined;
}

function isBuiltinPersonaId(id: string): boolean {
  return BUILTIN_PERSONAS.some((persona) => persona.id === id);
}

export function personaRecord(draft: PersonaDraft, existing: Agent | undefined): Agent {
  const now = Date.now();
  const id = existing?.id ?? idFromName(draft.name);
  const character = personaCharacter(draft.character);
  return {
    id,
    name: draft.name.trim(),
    description: draft.description.trim(),
    instructions: draft.instructions.trim(),
    skills: [...new Set(draft.skills)].sort(),
    ...(character ? { character } : {}),
    ...(isBuiltinPersonaId(id) ? { overridesBuiltin: true } : {}),
    builtin: false,
    origin: { kind: "persona" },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function upsertPersona(stored: readonly Agent[], persona: Agent): Agent[] {
  return [persona, ...stored.filter((item) => item.id !== persona.id)];
}

export function takenPersonaIds(agents: readonly Agent[], existingId: string | null): Set<string> {
  const taken = new Set(agents.map((agent) => agent.id));
  if (existingId) taken.delete(existingId);
  for (const persona of BUILTIN_PERSONAS) taken.add(persona.id);
  return taken;
}
