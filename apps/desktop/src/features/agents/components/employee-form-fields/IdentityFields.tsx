import type { FieldErrors, UseFormSetValue } from "react-hook-form";
import { EMPLOYEE_ID_PATTERN } from "@weave/core/browser";
import type { EmployeeFormValues } from "@/features/employees";
import { CheckSelect, InstructionSelect, MultiSelect, RESPONSIBILITY_CHOICES, RULE_CHOICES, RoleSelect } from "../employee-choices";
import { TextField } from "./FormFields";
import type { FieldGroupProps } from "./types";

interface IdentityFieldsProps extends FieldGroupProps {
  readonly errors: FieldErrors<EmployeeFormValues>;
  readonly isIdLocked: boolean;
  readonly setValue: UseFormSetValue<EmployeeFormValues>;
}

export function IdentityFields({ register, control, setValue, errors, isIdLocked }: IdentityFieldsProps) {
  return (
    <fieldset className="space-y-5">
      <legend className="sr-only">Identity</legend>
      <RoleSelect setValue={setValue} />
      <TextField register={register} name="name" label="Name" placeholder="e.g. Payments Engineer" rules={{ validate: (value) => value.trim() !== "" || "Give the employee a name." }} error={errors.name?.message} />
      <TextField
        register={register}
        name="id"
        label="Id"
        placeholder="payments-engineer"
        isReadOnly={isIdLocked}
        hint={isIdLocked ? "Customizing keeps the built-in id, so this project's copy replaces it." : "Lowercase words joined by dashes. Plans name employees by id."}
        rules={{ validate: (value) => EMPLOYEE_ID_PATTERN.test(value.trim()) || "Use lowercase letters, digits and dashes, starting with a letter." }}
        error={errors.id?.message}
      />
      <TextField register={register} name="description" label="Description" placeholder="What this employee owns" />
      <MultiSelect control={control} name="responsibilities" label="Responsibilities" hint="Matched against task text to assign work." options={RESPONSIBILITY_CHOICES} placeholder="Choose responsibilities" variant="menu" />
      <CheckSelect control={control} name="rules" label="Rules" hint="Standards this employee follows." options={RULE_CHOICES} />
      <InstructionSelect control={control} />
    </fieldset>
  );
}
