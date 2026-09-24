import type { EmployeeDraft, EmployeeView, ProjectModelView, ServerMessage, SkillView } from "../../../server/index.ts";

export type { EmployeeDraft, EmployeeView, ProjectModelView, SkillView };

export type WorkforceMessage = Extract<
  ServerMessage,
  { readonly type: "employees" | "employee-saved" | "employee-error" | "skills" | "project-model" | "project-model-error" }
>;

export type Transport = (payload: Readonly<Record<string, unknown>>) => void;

export type Loadable<T> =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly value: T }
  | { readonly status: "error"; readonly message: string };
