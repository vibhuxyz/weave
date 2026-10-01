import { EMPLOYEE_ID_PATTERN } from "@weave/core/browser";
import { idFromName } from "@/features/employees";
import type { Agent } from "../hooks/useAgents/types";
import { BUILTIN_PERSONAS } from "./builtins";
import type { PersonaDraft } from "./types";

export function personaIssue(draft: PersonaDraft, takenIds: ReadonlySet<string>): string | null {
  const name = draft.name.trim();
  const id = idFromName(name);
  if (!name) return "Give the persona a name.";
  if (!draft.instructions.trim()) return "Say how this persona makes the agent work.";
  if (!EMPLOYEE_ID_PATTERN.test(id)) return "Use a name that starts with a letter.";
  if (takenIds.has(id)) return "An employee or persona already uses that name.";
  return null;
}

export function personaRecord(draft: PersonaDraft, existing: Agent | undefined): Agent {
  const now = Date.now();
  return {
    id: existing?.id ?? idFromName(draft.name),
    name: draft.name.trim(),
    description: draft.description.trim(),
    instructions: draft.instructions.trim(),
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
