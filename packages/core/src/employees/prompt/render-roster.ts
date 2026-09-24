import { capLines, flatten } from "../../shared/index.ts";
import type { Employee } from "../model/index.ts";
import { isUnrestricted } from "../resolver/index.ts";

export const MAX_ROSTER_BYTES = 4_000;
const MAX_LISTED_RESPONSIBILITIES = 6;

function line(employee: Employee): string {
  const write = employee.permissions.filesystem.write;
  const scope = isUnrestricted(write) ? "any path" : write.join(", ");
  const owns = employee.responsibilities.slice(0, MAX_LISTED_RESPONSIBILITIES).join(", ");
  return `- ${employee.id}: ${flatten(employee.name)} — ${flatten(owns)}; writes ${scope}`;
}

export function renderRoster(employees: readonly Employee[]): string {
  return capLines(employees.map(line), MAX_ROSTER_BYTES);
}
