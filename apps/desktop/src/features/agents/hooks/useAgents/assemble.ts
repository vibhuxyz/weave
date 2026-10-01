import type { Agent } from "./types";

export function assembleAgents(
  employees: readonly Agent[],
  stored: readonly Agent[],
  builtins: readonly Agent[],
): Agent[] {
  const employeeIds = new Set(employees.map((agent) => agent.id));
  const builtin = builtins.filter((agent) => !employeeIds.has(agent.id));
  const builtinIds = new Set(builtin.map((agent) => agent.id));
  const custom = stored.filter(
    (agent) => agent.origin.kind === "persona" && !employeeIds.has(agent.id) && !builtinIds.has(agent.id),
  );
  return [...employees, ...builtin, ...custom];
}
