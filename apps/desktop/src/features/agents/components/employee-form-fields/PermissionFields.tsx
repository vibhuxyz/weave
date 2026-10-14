import { MultiSelect, PATH_CHOICES } from "../employee-choices";
import { FlagField } from "./FormFields";
import type { FieldGroupProps } from "./types";

export function PermissionFields({ control }: FieldGroupProps) {
  return (
    <fieldset className="space-y-5">
      <legend className="mb-3 text-sm text-foreground">Permissions</legend>
      <MultiSelect control={control} name="writePaths" label="Can write" hint="Globs inside the project. Tasks outside them are never assigned." options={PATH_CHOICES} placeholder="Choose what this employee can write" variant="menu" />
      <MultiSelect control={control} name="readPaths" label="Can read" hint="Shown to the employee, not enforced yet." options={PATH_CHOICES} placeholder="Choose what this employee can read" variant="menu" />
      <div className="space-y-1">
        <FlagField control={control} name="canDeploy" label="Allow deployment commands" />
        <FlagField control={control} name="canUseNetwork" label="Allow network access" />
        <FlagField control={control} name="canCommit" label="Allow git commits" />
      </div>
    </fieldset>
  );
}
