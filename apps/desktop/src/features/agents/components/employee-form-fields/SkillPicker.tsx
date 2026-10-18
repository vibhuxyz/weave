import { Controller, type Control } from "react-hook-form";
import { linesOf, type EmployeeFormValues } from "@/features/employees";
import { SkillChecklist } from "../skill-choice";

const EMPLOYEE_SKILLS_HINT = "Choose the skills this employee follows. They load into the chat whenever this employee is set to Always or turned on.";

export function SkillPicker({ control }: { readonly control: Control<EmployeeFormValues> }) {
  return (
    <Controller
      control={control}
      name="skills"
      render={({ field }) => (
        <SkillChecklist value={linesOf(field.value)} hint={EMPLOYEE_SKILLS_HINT} onChange={(next) => field.onChange(next.join("\n"))} />
      )}
    />
  );
}
