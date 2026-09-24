import type { EmployeeDetail, EmployeeEntry, ServerMessage } from "../../../server/index.ts";

export type { EmployeeDetail, EmployeeEntry };

export type Employee = EmployeeEntry["employee"];

export type EmployeeListingMessage = Extract<ServerMessage, { readonly type: "employees" | "employees-failed" }>;

export type EmployeeDetailMessage = Extract<ServerMessage, { readonly type: "employee-detail" | "employee-detail-failed" }>;

export type SkippedEmployee = Extract<ServerMessage, { readonly type: "employees" }>["skipped"][number];

export type EmployeeListing =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly entries: readonly EmployeeEntry[]; readonly skipped: readonly SkippedEmployee[] }
  | { readonly status: "error"; readonly message: string };

export type EmployeeDetailState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly detail: EmployeeDetail }
  | { readonly status: "error"; readonly message: string };

export type EmployeeChangeResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly message: string };

export interface EmployeeActions {
  readonly readEmployee: (id: string) => void;
  readonly saveEmployee: (fields: unknown, replacesId: string | null) => Promise<EmployeeChangeResult>;
  readonly deleteEmployee: (id: string) => Promise<EmployeeChangeResult>;
}
