import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EMPLOYEE_FILE_EXTENSION } from "./constants.ts";
import { validateEmployeeFields } from "./employee-fields.ts";
import { loadRegistry } from "./load-employees.ts";
import { employeesDirOf, projectFileOf, removeProjectFile } from "./project-files.ts";

export type EmployeeChange = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly message: string };

export interface SaveEmployeeInput {
  readonly projectDir: string;
  readonly fields: unknown;
  readonly replacesId: string | null;
}

export async function saveEmployee(input: SaveEmployeeInput): Promise<EmployeeChange> {
  const validated = validateEmployeeFields(input.fields);
  if (!validated.ok) return validated;
  const { id } = validated.employee;
  const registry = await loadRegistry(input.projectDir);
  const taken = registry.byId.get(id);
  if (taken && input.replacesId !== id) return { ok: false, message: `Cannot save employee: the id ${id} is already used by ${taken.name} (${taken.source}).` };
  const existing = projectFileOf(registry, id);
  await mkdir(employeesDirOf(input.projectDir), { recursive: true });
  const target = join(await realpath(employeesDirOf(input.projectDir)), `${id}${EMPLOYEE_FILE_EXTENSION}`);
  await writeFile(target, validated.fileText);
  const stale = [existing, projectFileOf(registry, input.replacesId)].filter((path): path is string => path !== null && path !== target);
  await Promise.all([...new Set(stale)].map((path) => removeProjectFile(input.projectDir, path)));
  return { ok: true, id };
}
