import { join } from "node:path";
import { deleteProjectEmployee, employeePerformance, loadEmployeeRegistry, parseEmployee, readHistory, readMemory, saveProjectEmployee, weaveDirFor, type EmployeeRegistry } from "@weave/core";
import type { EmployeeView } from "../shared/index.ts";
import { USER_EMPLOYEES_DIR } from "./constants.ts";
import { toEmployeeView } from "./employee-view.ts";

export interface WorkforcePaths {
  readonly projectDir: string;
  readonly weaveHome: string;
}

export interface EmployeeListing {
  readonly registry: EmployeeRegistry;
  readonly views: readonly EmployeeView[];
}

export type EmployeeChange = { readonly ok: true; readonly employeeId: string; readonly path: string } | { readonly ok: false; readonly reason: string };

export function loadRegistry(paths: WorkforcePaths): Promise<EmployeeRegistry> {
  return loadEmployeeRegistry({ projectRoot: paths.projectDir, userDir: join(paths.weaveHome, USER_EMPLOYEES_DIR) });
}

export async function listEmployees(paths: WorkforcePaths): Promise<EmployeeListing> {
  const weaveDir = weaveDirFor(paths.projectDir);
  const [registry, history] = await Promise.all([loadRegistry(paths), readHistory(weaveDir)]);
  const performance = employeePerformance(history.runs);
  const memories = await Promise.all(registry.employees.map((employee) => readMemory(weaveDir, employee.id)));
  const views = registry.employees.map((employee, index) =>
    toEmployeeView(employee, { memory: memories[index]?.entries ?? [], performance: performance.get(employee.id) }),
  );
  return { registry, views };
}

export async function saveEmployee(paths: WorkforcePaths, draft: unknown): Promise<EmployeeChange> {
  const parsed = parseEmployee(draft, { source: "project", sourcePath: null });
  if (!parsed.ok) return { ok: false, reason: `Cannot save employee: ${parsed.issues.join("; ")}` };
  const saved = await saveProjectEmployee(paths.projectDir, parsed.employee);
  return saved.ok ? { ok: true, employeeId: parsed.employee.id, path: saved.path } : saved;
}

export async function deleteEmployee(paths: WorkforcePaths, employeeId: unknown): Promise<EmployeeChange> {
  if (typeof employeeId !== "string") return { ok: false, reason: "Cannot delete employee: missing id" };
  const deleted = await deleteProjectEmployee(paths.projectDir, employeeId);
  return deleted.ok ? { ok: true, employeeId, path: deleted.path } : deleted;
}
