import { join } from "node:path";
import { builtinEmployees } from "../builtin/index.ts";
import { EMPLOYEES_SUBDIR, discoverEmployees, type EmployeeDir } from "../config/index.ts";
import { buildEmployeeRegistry } from "./build-registry.ts";
import type { EmployeeRegistry } from "./types.ts";

export const PROJECT_EMPLOYEES_DIR = EMPLOYEES_SUBDIR;

export interface LoadRegistryOptions {
  readonly projectRoot: string;
  readonly userDir?: string | null;
  readonly includeBuiltins?: boolean;
}

export async function loadEmployeeRegistry(options: LoadRegistryOptions): Promise<EmployeeRegistry> {
  const dirs: EmployeeDir[] = [
    { dir: join(options.projectRoot, PROJECT_EMPLOYEES_DIR), source: "project" },
    ...(options.userDir ? [{ dir: options.userDir, source: "user" as const }] : []),
  ];
  const discovered = await discoverEmployees(dirs);
  const builtins = options.includeBuiltins === false ? [] : builtinEmployees();
  return buildEmployeeRegistry([...builtins, ...discovered.raws], discovered.skipped);
}
