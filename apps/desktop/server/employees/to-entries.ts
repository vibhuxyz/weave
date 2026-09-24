import type { EmployeePerformance, EmployeeRegistry, EmployeeSource, SkippedEmployee } from "@weave/core";
import type { EmployeeEntry } from "../shared/index.ts";

export interface EmployeeListing {
  readonly entries: readonly EmployeeEntry[];
  readonly skipped: readonly SkippedEmployee[];
}

export function toEntries(registry: EmployeeRegistry, performance: ReadonlyMap<string, EmployeePerformance>): EmployeeListing {
  const overriddenById = new Map<string, EmployeeSource>();
  for (const entry of registry.overridden) {
    if (!overriddenById.has(entry.id)) overriddenById.set(entry.id, entry.hidden);
  }
  const entries = registry.employees.map((employee) => ({
    employee,
    overrides: overriddenById.get(employee.id) ?? null,
    performance: performance.get(employee.id) ?? null,
  }));
  return { entries, skipped: registry.skipped };
}
