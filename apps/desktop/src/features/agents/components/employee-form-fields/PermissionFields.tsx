import { LIST_HINT } from "./constants";
import { FlagField, TextField } from "./FormFields";
import type { FieldGroupProps } from "./types";

export function PermissionFields({ register, control }: FieldGroupProps) {
  return (
    <fieldset className="space-y-5">
      <legend className="mb-3 text-sm text-foreground">Permissions</legend>
      <TextField register={register} name="writePaths" label="Can write" rows={3} hint={`${LIST_HINT} Globs inside the project. Tasks outside them are never assigned.`} />
      <TextField register={register} name="readPaths" label="Can read" rows={2} hint={`${LIST_HINT} Shown to the employee; not enforced yet.`} />
      <div className="space-y-1">
        <FlagField control={control} name="canDeploy" label="Allow deployment commands" />
        <FlagField control={control} name="canUseNetwork" label="Allow network access" />
        <FlagField control={control} name="canCommit" label="Allow git commits" />
      </div>
    </fieldset>
  );
}
