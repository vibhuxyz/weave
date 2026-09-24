import type { EmployeeDraft, EmployeeView } from "../types";

export interface EmployeeFormValues {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly responsibilities: string;
  readonly skills: string;
  readonly rules: string;
  readonly instructions: string;
  readonly write: string;
  readonly read: string;
  readonly deployment: boolean;
  readonly network: boolean;
  readonly gitCommit: boolean;
  readonly required: readonly string[];
  readonly preferred: readonly string[];
  readonly preferredEngines: readonly string[];
  readonly restrictEngines: boolean;
  readonly allowedEngines: readonly string[];
}

export const EMPLOYEE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const EMPTY_FORM: EmployeeFormValues = {
  id: "", name: "", description: "", responsibilities: "", skills: "", rules: "", instructions: "",
  write: "**/*", read: "**/*", deployment: false, network: true, gitCommit: false,
  required: [], preferred: [], preferredEngines: [], restrictEngines: false, allowedEngines: [],
};

export function splitList(text: string): readonly string[] {
  return [...new Set(text.split(/[\n,]/).map((item) => item.trim()).filter((item) => item !== ""))];
}

function lines(items: readonly string[]): string {
  return items.join("\n");
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^[^a-z]+/, "");
}

export function formFromEmployee(employee: EmployeeView | null, mode: "create" | "edit" | "duplicate"): EmployeeFormValues {
  if (!employee) return EMPTY_FORM;
  const copy = mode === "duplicate";
  return {
    id: copy ? `${employee.id}-copy` : employee.id,
    name: copy ? `${employee.name} copy` : employee.name,
    description: employee.description,
    responsibilities: lines(employee.responsibilities),
    skills: employee.skills.join(", "),
    rules: lines(employee.rules),
    instructions: employee.instructions,
    write: lines(employee.permissions.write),
    read: lines(employee.permissions.read),
    deployment: employee.permissions.deployment,
    network: employee.permissions.network,
    gitCommit: employee.permissions.gitCommit,
    required: employee.verification.required,
    preferred: employee.verification.preferred,
    preferredEngines: employee.engines.preferred,
    restrictEngines: employee.engines.allowed !== null,
    allowedEngines: employee.engines.allowed ?? [],
  };
}

export function draftFromForm(values: EmployeeFormValues): EmployeeDraft {
  return {
    id: values.id.trim(),
    name: values.name.trim(),
    description: values.description.trim(),
    responsibilities: splitList(values.responsibilities),
    skills: splitList(values.skills),
    rules: values.rules.split("\n").map((rule) => rule.trim()).filter((rule) => rule !== ""),
    instructions: values.instructions,
    permissions: {
      filesystem: { read: splitList(values.read), write: splitList(values.write) },
      deployment: { allowed: values.deployment },
      network: { allowed: values.network },
      git: { commit: values.gitCommit },
    },
    engines: { preferred: values.preferredEngines, ...(values.restrictEngines ? { allowed: values.allowedEngines } : {}) },
    verification: { required: values.required, preferred: values.preferred.filter((rung) => !values.required.includes(rung)) },
  };
}
