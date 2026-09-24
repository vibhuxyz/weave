import { loadRegistry } from "./load-employees.ts";
import { projectFileOf, removeProjectFile } from "./project-files.ts";
import type { EmployeeChange } from "./save-employee.ts";

export async function deleteEmployee(projectDir: string, id: string): Promise<EmployeeChange> {
  const registry = await loadRegistry(projectDir);
  const path = projectFileOf(registry, id);
  if (!path) return { ok: false, message: `Cannot delete employee ${id}: only employees saved in this project can be deleted.` };
  await removeProjectFile(projectDir, path);
  return { ok: true, id };
}
