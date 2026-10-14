import { useState } from "react";
import type { UseFormSetValue } from "react-hook-form";
import type { EmployeeFormValues } from "@/features/employees";
import { FIELD } from "@/features/projects/components";
import { cn } from "@/shared/lib";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui";
import { ChoiceFrame } from "./ChoiceFrame";
import { ROLE_OPTIONS, rolePatch } from "./catalog";

export function RoleSelect({ setValue }: { readonly setValue: UseFormSetValue<EmployeeFormValues> }) {
  const [roleId, setRoleId] = useState("");
  return (
    <ChoiceFrame label="Start from a role" hint="Copies description, responsibilities, rules, instructions, skills, write scope, permission toggles and checks. Change any of them after.">
      <Select value={roleId || undefined} onValueChange={(id) => { setRoleId(id); applyRole(id, setValue); }}>
        <SelectTrigger className={cn(FIELD, "h-11 w-full rounded-xl")}>
          <SelectValue placeholder="Choose a built-in role" />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          {ROLE_OPTIONS.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </ChoiceFrame>
  );
}

function applyRole(id: string, setValue: UseFormSetValue<EmployeeFormValues>): void {
  const patch = rolePatch(id);
  if (!patch) return;
  setValue("description", patch.description, { shouldDirty: true });
  setValue("responsibilities", patch.responsibilities, { shouldDirty: true });
  setValue("skills", patch.skills, { shouldDirty: true });
  setValue("rules", patch.rules, { shouldDirty: true });
  setValue("instructions", patch.instructions, { shouldDirty: true });
  setValue("writePaths", patch.writePaths, { shouldDirty: true });
  setValue("canDeploy", patch.canDeploy, { shouldDirty: true });
  setValue("canUseNetwork", patch.canUseNetwork, { shouldDirty: true });
  setValue("canCommit", patch.canCommit, { shouldDirty: true });
  setValue("requiredRungs", [...patch.requiredRungs], { shouldDirty: true });
  setValue("preferredRungs", [...patch.preferredRungs], { shouldDirty: true });
}
