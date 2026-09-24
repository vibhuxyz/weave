import type { Employee, EmployeePerformance, EmployeeSource, MemoryEntry, SkippedEmployee } from "@weave/core";

export interface EmployeeEntry {
  readonly employee: Employee;
  readonly overrides: EmployeeSource | null;
  readonly performance: EmployeePerformance | null;
}

export interface EmployeeDetail {
  readonly id: string;
  readonly brief: string;
  readonly memory: readonly MemoryEntry[];
  readonly memoryTotal: number;
  readonly memoryIssue: string | null;
}

export type EmployeeClientMessage =
  | { readonly type: "list-employees" }
  | { readonly type: "read-employee"; readonly id: string }
  | { readonly type: "save-employee"; readonly requestId: string; readonly fields: unknown; readonly replacesId: string | null }
  | { readonly type: "delete-employee"; readonly requestId: string; readonly id: string };

export type EmployeeServerMessage =
  | { readonly type: "employees"; readonly entries: readonly EmployeeEntry[]; readonly skipped: readonly SkippedEmployee[] }
  | { readonly type: "employees-failed"; readonly message: string }
  | { readonly type: "employee-detail"; readonly detail: EmployeeDetail }
  | { readonly type: "employee-detail-failed"; readonly id: string; readonly message: string }
  | { readonly type: "employee-changed"; readonly requestId: string; readonly id: string }
  | { readonly type: "employee-change-failed"; readonly requestId: string; readonly message: string };

export const EMPLOYEE_CLIENT_MESSAGE_TYPES = ["list-employees", "read-employee", "save-employee", "delete-employee"] as const;
