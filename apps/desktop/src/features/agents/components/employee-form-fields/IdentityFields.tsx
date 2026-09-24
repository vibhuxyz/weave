import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { EMPLOYEE_ID_PATTERN } from "@weave/core/browser";
import type { EmployeeFormValues } from "@/features/employees";
import { LIST_HINT } from "./constants";
import { TextField } from "./FormFields";

interface IdentityFieldsProps {
  readonly register: UseFormRegister<EmployeeFormValues>;
  readonly errors: FieldErrors<EmployeeFormValues>;
  readonly isIdLocked: boolean;
}

export function IdentityFields({ register, errors, isIdLocked }: IdentityFieldsProps) {
  return (
    <fieldset className="space-y-5">
      <legend className="sr-only">Identity</legend>
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
      <TextField register={register} name="responsibilities" label="Responsibilities" rows={4} hint={`${LIST_HINT} Matched against task text to assign work.`} />
      <TextField register={register} name="skills" label="Skills" rows={3} hint={LIST_HINT} />
      <TextField register={register} name="rules" label="Rules" rows={3} hint={LIST_HINT} />
      <TextField register={register} name="instructions" label="Instructions" rows={8} hint="Markdown given to the employee on every task." />
    </fieldset>
  );
}
