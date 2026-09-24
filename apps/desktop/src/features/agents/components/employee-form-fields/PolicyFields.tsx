import { useWatch } from "react-hook-form";
import { LIST_HINT, MAX_MEMORY_ENTRIES, MAX_RECALL_COUNT } from "./constants";
import { CountField, FlagField, TextField } from "./FormFields";
import { RungPicker } from "./RungPicker";
import type { FieldGroupProps } from "./types";

export function PolicyFields({ register, control }: FieldGroupProps) {
  const isRestricted = useWatch({ control, name: "isEngineListRestricted" });
  const isMemoryEnabled = useWatch({ control, name: "isMemoryEnabled" });
  return (
    <>
      <fieldset className="space-y-5">
        <legend className="mb-3 text-sm text-foreground">Engines</legend>
        <TextField register={register} name="preferredEngines" label="Try first" rows={2} hint={`${LIST_HINT} Engine ids such as claude-code or codex.`} />
        <FlagField control={control} name="isEngineListRestricted" label="Only allow listed engines" />
        {isRestricted && <TextField register={register} name="allowedEngines" label="Allowed engines" rows={2} hint={`${LIST_HINT} Any other engine is never used.`} />}
        <TextField register={register} name="capabilities" label="Capabilities needed" rows={2} hint={`${LIST_HINT} For example: browser.`} />
      </fieldset>
      <fieldset className="space-y-5">
        <legend className="mb-3 text-sm text-foreground">Verification before merge</legend>
        <RungPicker control={control} name="requiredRungs" label="Must pass" />
        <RungPicker control={control} name="preferredRungs" label="Must pass when the project has them" />
      </fieldset>
      <fieldset className="space-y-5">
        <legend className="mb-3 text-sm text-foreground">Memory</legend>
        <FlagField control={control} name="isMemoryEnabled" label="Remember outcomes and notes" />
        {isMemoryEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <CountField register={register} name="memoryMaxEntries" label="Entries kept" max={MAX_MEMORY_ENTRIES} />
            <CountField register={register} name="memoryRecallCount" label="Recalled per task" max={MAX_RECALL_COUNT} />
          </div>
        )}
      </fieldset>
    </>
  );
}
