import { join } from "node:path";
import { employeePerformance, loadEmployeeRegistry, readHistory, type EmployeeRegistry } from "@weave/core";
import { createLogger } from "../logging/index.ts";
import { WEAVE_DIR_NAME } from "./constants.ts";
import { toEntries, type EmployeeListing } from "./to-entries.ts";

const log = createLogger("employees");

export function weaveDirOf(projectDir: string): string {
  return join(projectDir, WEAVE_DIR_NAME);
}

export function loadRegistry(projectDir: string): Promise<EmployeeRegistry> {
  return loadEmployeeRegistry({ projectRoot: projectDir });
}

export async function listEmployees(projectDir: string): Promise<EmployeeListing> {
  const [registry, history] = await Promise.all([loadRegistry(projectDir), readHistory(weaveDirOf(projectDir))]);
  const [firstSkipped] = history.skipped;
  if (firstSkipped) log.warn("Some runs were left out of employee performance", { count: history.skipped.length, first: firstSkipped });
  return toEntries(registry, employeePerformance(history.runs));
}
