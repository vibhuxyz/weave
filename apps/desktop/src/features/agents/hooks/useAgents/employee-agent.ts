import type { EmployeeSummary } from "@weave/core/browser";
import type { Agent, AgentOrigin } from "./types";

type EmployeeSource = Extract<AgentOrigin, { readonly kind: "employee" }>["source"];

const EMPLOYEE_CREATED_AT = 0;

function section(title: string, items: readonly string[]): readonly string[] {
  return items.length === 0 ? [] : [`${title}:`, ...items.map((item) => `- ${item}`)];
}

export function employeeInstructions(employee: EmployeeSummary): string {
  return [
    ...(employee.description ? [employee.description] : []),
    ...section("Responsibilities", employee.responsibilities),
    ...section("Rules", employee.rules),
    ...(employee.instructions.trim() ? [employee.instructions.trim()] : []),
  ].join("\n");
}

export function agentFromEmployee(employee: EmployeeSummary, source: EmployeeSource): Agent {
  return {
    id: employee.id,
    name: employee.name,
    description: employee.description,
    instructions: employeeInstructions(employee),
    builtin: source === "builtin",
    origin: { kind: "employee", source },
    createdAt: EMPLOYEE_CREATED_AT,
    updatedAt: EMPLOYEE_CREATED_AT,
  };
}
