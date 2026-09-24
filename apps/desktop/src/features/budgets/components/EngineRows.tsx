import { useId } from "react";
import { useFieldArray, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import { Trash2Icon } from "lucide-react";
import { FIELD } from "@/features/projects/components";
import { cn } from "@/shared/lib";
import { Button } from "@/shared/ui";
import { EMPTY_ROW, engineIdProblem, type BudgetFormValues } from "../lib";
import { MAX_ENGINE_ROWS } from "./constants";
import { LimitInputs } from "./LimitInputs";

interface EngineRowsProps {
  readonly control: Control<BudgetFormValues>;
  readonly register: UseFormRegister<BudgetFormValues>;
  readonly errors: FieldErrors<BudgetFormValues>["engines"];
}

export function EngineRows({ control, register, errors }: EngineRowsProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "engines" });
  const baseId = useId();
  return (
    <>
      {fields.map((field, index) => (
        <div key={field.id} className="contents">
          <div className="flex min-w-0 items-start gap-1">
            <label htmlFor={`${baseId}-${index}`} className="sr-only">Engine id</label>
            <input id={`${baseId}-${index}`} placeholder="engine id, e.g. codex" className={cn(FIELD, "h-10 font-mono text-xs")} {...register(`engines.${index}.engineId`, { validate: (value, values) => engineIdProblem(value, values.engines) ?? true })} />
            <button type="button" aria-label="Remove this engine limit" onClick={() => remove(index)} className="grid size-10 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground">
              <Trash2Icon className="size-4" />
            </button>
          </div>
          <LimitInputs register={register} path={`engines.${index}`} label={`Engine ${index + 1}`} errors={errors?.[index]} />
        </div>
      ))}
      <div className="col-span-full">
        <Button type="button" variant="ghost" size="sm" disabled={fields.length >= MAX_ENGINE_ROWS} onClick={() => append({ engineId: "", ...EMPTY_ROW })}>
          Add a limit for one engine
        </Button>
      </div>
    </>
  );
}
