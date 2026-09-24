import { isRecord, parseEmployee, type Employee } from "@weave/core";

export type ValidatedEmployee =
  | { readonly ok: true; readonly employee: Employee; readonly fileText: string }
  | { readonly ok: false; readonly message: string };

function toFileFields(employee: Employee): Readonly<Record<string, unknown>> {
  const { allowed, preferred } = employee.engines;
  return {
    id: employee.id,
    name: employee.name,
    ...(employee.description ? { description: employee.description } : {}),
    responsibilities: employee.responsibilities,
    skills: employee.skills,
    rules: employee.rules,
    ...(employee.instructions ? { instructions: employee.instructions } : {}),
    permissions: employee.permissions,
    capabilities: employee.capabilities,
    engines: allowed === null ? { preferred } : { preferred, allowed },
    verification: employee.verification,
    memory: employee.memory,
  };
}

export function validateEmployeeFields(fields: unknown): ValidatedEmployee {
  if (!isRecord(fields)) return { ok: false, message: "Cannot save employee: the request has no employee fields." };
  if ("extends" in fields) return { ok: false, message: 'Cannot save employee: "extends" is not supported from the editor.' };
  const parsed = parseEmployee(fields, { source: "project", sourcePath: null });
  if (!parsed.ok) return { ok: false, message: `Cannot save employee: ${parsed.issues.join("; ")}` };
  return { ok: true, employee: parsed.employee, fileText: `${JSON.stringify(toFileFields(parsed.employee), null, 2)}\n` };
}
