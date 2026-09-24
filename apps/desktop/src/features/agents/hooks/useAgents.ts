import { useCallback, useMemo } from "react";
import { BUILTIN_EMPLOYEE_SUMMARIES } from "@weave/core/browser";
import { useEmployeeListing, type EmployeeListing } from "@/features/employees";
import { usePersistedState } from "@/shared/hooks";
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

  const agents = useMemo(() => {
    const employees = employeeAgents(listing);
    const employeeIds = new Set(employees.map((agent) => agent.id));
    return [...employees, ...stored.filter((persona) => !employeeIds.has(persona.id))];
  }, [listing, stored]);

  const removePersona = useCallback(
    (id: string) => setStored((current) => current.filter((persona) => persona.id !== id)),
    [setStored],
  );

  return { agents, removePersona };
}
