import type { Control, UseFormRegister } from "react-hook-form";
import type { EmployeeFormValues } from "@/features/employees";

type FieldNamesOf<T> = { [K in keyof EmployeeFormValues]: EmployeeFormValues[K] extends T ? K : never }[keyof EmployeeFormValues];

export type TextFieldName = FieldNamesOf<string>;
export type FlagFieldName = FieldNamesOf<boolean>;
export type CountFieldName = FieldNamesOf<number>;

export interface FieldGroupProps {
  readonly register: UseFormRegister<EmployeeFormValues>;
  readonly control: Control<EmployeeFormValues>;
}
