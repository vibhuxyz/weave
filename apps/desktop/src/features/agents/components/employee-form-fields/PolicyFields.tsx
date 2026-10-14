import { useWatch } from "react-hook-form";
import { CAPABILITY_CHOICES, CountSelect, EngineSelect, MEMORY_ENTRY_PRESETS, MEMORY_RECALL_PRESETS, MultiSelect } from "../employee-choices";
import { MAX_MEMORY_ENTRIES, MAX_RECALL_COUNT } from "./constants";
import { FlagField } from "./FormFields";
import { RungPicker } from "./RungPicker";
import type { FieldGroupProps } from "./types";

export function PolicyFields({ control }: FieldGroupProps) {
  const isRestricted = useWatch({ control, name: "isEngineListRestricted" });
  const isMemoryEnabled = useWatch({ control, name: "isMemoryEnabled" });
  return (
    <>
      <fieldset className="space-y-5">
        <legend className="mb-3 text-sm text-foreground">Engines</legend>
        <EngineSelect control={control} name="preferredEngines" label="Try first" hint="Checked engines are tried in the order you pick them." />
        <FlagField control={control} name="isEngineListRestricted" label="Only allow listed engines" />
        {isRestricted ? <EngineSelect control={control} name="allowedEngines" label="Allowed engines" hint="Any other engine is never used." /> : null}
        <MultiSelect control={control} name="capabilities" label="Capabilities needed" hint="For example: browser." options={CAPABILITY_CHOICES} variant="chips" />
      </fieldset>
      <fieldset className="space-y-5">
        <legend className="mb-3 text-sm text-foreground">Verification before merge</legend>
        <RungPicker control={control} name="requiredRungs" label="Must pass" />
        <RungPicker control={control} name="preferredRungs" label="Must pass when the project has them" />
      </fieldset>
      <fieldset className="space-y-5">
        <legend className="mb-3 text-sm text-foreground">Memory</legend>
        <FlagField control={control} name="isMemoryEnabled" label="Remember outcomes and notes" />
        {isMemoryEnabled ? (
          <div className="grid grid-cols-2 gap-3">
            <CountSelect control={control} name="memoryMaxEntries" label="Entries kept" presets={MEMORY_ENTRY_PRESETS} max={MAX_MEMORY_ENTRIES} />
            <CountSelect control={control} name="memoryRecallCount" label="Recalled per task" presets={MEMORY_RECALL_PRESETS} max={MAX_RECALL_COUNT} />
          </div>
        ) : null}
      </fieldset>
    </>
  );
}
