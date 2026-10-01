import { useCallback, useMemo } from "react";
import { BUILTIN_EMPLOYEE_SUMMARIES } from "@weave/core/browser";
import { useEmployeeListing, type EmployeeListing } from "@/features/employees";
import { usePersistedState } from "@/shared/hooks";
import { takenAvatarKeys } from "../lib";
import { BUILTIN_PERSONAS, personaIssue, personaRecord, takenPersonaIds, upsertPersona, type PersonaDraft } from "../personas";
import { assembleAgents } from "./useAgents/assemble";
import { agentFromEmployee } from "./useAgents/employee-agent";
import { isStoredAgent, personaOf, type Agent } from "./useAgents/types";

export type { Agent } from "./useAgents/types";
export { activeAgents, formatPersonaSystemPrompt } from "./useAgents/personaPrompt";

const PERSONAS_KEY = "berd:agents";

function employeeAgents(listing: EmployeeListing): readonly Agent[] {
  if (listing.status !== "ready") return BUILTIN_EMPLOYEE_SUMMARIES.map((summary) => agentFromEmployee(summary, "builtin"));
  return listing.entries.map(({ employee }) => agentFromEmployee(employee, employee.source));
}

export function useAgents() {
  const listing = useEmployeeListing();
  const [stored, setStored] = usePersistedState<Agent[]>(PERSONAS_KEY, [], (value, defaults) =>
    Array.isArray(value) ? value.filter(isStoredAgent).map(personaOf) : defaults,
  );
  const employees = useMemo(() => employeeAgents(listing), [listing]);
  const agents = useMemo(() => assembleAgents(employees, stored, BUILTIN_PERSONAS), [employees, stored]);

  const removePersona = useCallback(
    (id: string) => setStored((current) => current.filter((persona) => persona.id !== id)),
    [setStored],
  );
  const savePersona = useCallback((draft: PersonaDraft, existingId: string | null) => {
    const issue = personaIssue(draft, takenPersonaIds(agents, existingId), takenAvatarKeys(agents, existingId));
    if (issue) return { ok: false as const, message: issue };
    const existing = existingId
      ? stored.find((agent) => agent.id === existingId) ?? agents.find((agent) => agent.id === existingId)
      : undefined;
    const persona = personaRecord(draft, existing);
    setStored((current) => upsertPersona(current, persona));
    return { ok: true as const, id: persona.id };
  }, [agents, stored, setStored]);

  return { agents, removePersona, savePersona };
}
