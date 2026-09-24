import type { Employee, EmployeeSource, SkippedEmployee } from "../model/index.ts";

export interface OverriddenEmployee {
  readonly id: string;
  readonly by: EmployeeSource;
  readonly hidden: EmployeeSource;
}

export interface EmployeeRegistry {
  readonly employees: readonly Employee[];
  readonly byId: ReadonlyMap<string, Employee>;
  readonly overridden: readonly OverriddenEmployee[];
  readonly skipped: readonly SkippedEmployee[];
}
