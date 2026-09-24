import { useMemo } from "react";
import { BUILTIN_EMPLOYEE_SUMMARIES, type EmployeeSummary } from "@weave/core/browser";
import { usePersistedState } from "@/shared/hooks";
import { useWorkforceStore, type EmployeeView } from "@/features/workforce";
import { isAgent, type Agent } from "./useAgents/types";

export type { Agent, AgentDraft } from "./useAgents/types";
export { activeAgents, formatPersonaSystemPrompt } from "./useAgents/personaPrompt";

export const EMPLOYEE_AGENT_PREFIX = "employee:";

export function employeeAgentId(employeeId: string): string {
  return `${EMPLOYEE_AGENT_PREFIX}${employeeId}`;
}

function fromEmployee(employee: EmployeeView): Agent {
  return {
    id: employeeAgentId(employee.id),
    name: employee.name,
    description: employee.description || employee.responsibilities.slice(0, 3).join(", "),
    instructions: employee.brief,
    builtin: employee.source === "builtin",
    createdAt: 0,
    updatedAt: 0,
  };
}

function fromSummary(summary: EmployeeSummary): Agent {
  return {
    id: employeeAgentId(summary.id),
    name: summary.name,
    description: summary.description,
    instructions: `You are ${summary.name}. ${summary.description} You own: ${summary.responsibilities.join(", ")}.`,
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

/**
 * Chat agents are the employee registry: built-in, user and project employees
 * from the server, or the built-in summaries until it answers. Personas saved
 * by earlier versions stay listed after them so nothing a user made is lost.
 */
export function useAgents() {
  const [stored] = usePersistedState<Agent[]>("berd:agents", [], (value, defaults) =>
    Array.isArray(value) ? value.filter(isAgent) : defaults,
  );
  const employees = useWorkforceStore((state) => state.employees);
  const agents = useMemo(() => {
    const staff = employees.status === "ready" ? employees.value.map(fromEmployee) : BUILTIN_EMPLOYEE_SUMMARIES.map(fromSummary);
    return [...staff, ...stored.filter((agent) => !agent.builtin)];
  }, [employees, stored]);
  return { agents };
}
