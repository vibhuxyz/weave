import { realpath, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PROJECT_EMPLOYEES_DIR, isNotFound, type EmployeeRegistry } from "@weave/core";

export function employeesDirOf(projectDir: string): string {
  return join(projectDir, PROJECT_EMPLOYEES_DIR);
}

export function projectFileOf(registry: EmployeeRegistry, id: string | null): string | null {
  if (id === null) return null;
  const employee = registry.byId.get(id);
  return employee?.source === "project" ? employee.sourcePath : null;
}

export async function removeProjectFile(projectDir: string, path: string): Promise<void> {
  const root = await realpath(employeesDirOf(projectDir));
  if (dirname(path) !== root) throw new Error(`Refusing to delete ${path}: it is outside ${root}`);
  await rm(path).catch((error: unknown) => {
    if (!isNotFound(error)) throw error;
  });
}
