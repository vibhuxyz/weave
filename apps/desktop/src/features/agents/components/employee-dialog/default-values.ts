import { copyFormValues, emptyFormValues, toFormValues, type EmployeeFormValues } from "@/features/employees";
import type { EmployeeDialogState } from "@/features/agents/hooks";

export function defaultValuesFor(state: EmployeeDialogState): EmployeeFormValues {
  switch (state.mode) {
    case "create":
      return emptyFormValues();
    case "duplicate":
      return copyFormValues(state.employee);
    case "edit":
    case "customize":
      return toFormValues(state.employee);
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

export function replacesIdFor(state: EmployeeDialogState): string | null {
  return state.mode === "edit" || state.mode === "customize" ? state.employee.id : null;
}

export const DIALOG_TITLES: Readonly<Record<EmployeeDialogState["mode"], string>> = {
  create: "New employee",
  edit: "Edit employee",
  customize: "Customize for this project",
  duplicate: "Duplicate employee",
};
