import type { Agent } from "./types";

export function assembleAgents(
  employees: readonly Agent[],
  stored: readonly Agent[],
  builtins: readonly Agent[],
): Agent[] {
  const employeeIds = new Set(employees.map((agent) => agent.id));
  const storedPersonas = stored.filter((agent) => agent.origin.kind === "persona" && !employeeIds.has(agent.id));
  const storedById = new Map(storedPersonas.map((agent) => [agent.id, agent]));
  const builtinIds = new Set(builtins.map((agent) => agent.id));
  const resolvedBuiltins = builtins
    .filter((agent) => !employeeIds.has(agent.id))
    .map((agent) => storedById.get(agent.id) ?? agent);
  const custom = storedPersonas.filter((agent) => !builtinIds.has(agent.id));
  return [...employees, ...resolvedBuiltins, ...custom];
}
