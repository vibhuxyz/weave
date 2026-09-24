import { useId } from "react";
import { Controller, type Control, type RegisterOptions, type UseFormRegister } from "react-hook-form";
import type { EmployeeFormValues } from "@/features/employees";
import { FIELD, LABEL } from "@/features/projects/components";
import { cn } from "@/shared/lib";
import { Switch } from "@/shared/ui";
import type { CountFieldName, FlagFieldName, TextFieldName } from "./types";

interface TextFieldProps {
  readonly register: UseFormRegister<EmployeeFormValues>;
  readonly name: TextFieldName;
  readonly label: string;
  readonly hint?: string;
  readonly placeholder?: string;
  readonly rows?: number;
  readonly isReadOnly?: boolean;
  readonly rules?: RegisterOptions<EmployeeFormValues, TextFieldName>;
  readonly error?: string;
}

export function TextField({ register, name, label, hint, placeholder, rows, isReadOnly, rules, error }: TextFieldProps) {
  const id = useId();
  const described = hint || error ? `${id}-note` : undefined;
  const common = { id, placeholder, readOnly: isReadOnly, "aria-describedby": described, "aria-invalid": error ? true : undefined, ...register(name, rules) };
  return (
    <div className="space-y-2">
      <label htmlFor={id} className={LABEL}>{label}</label>
      {rows ? (
        <textarea {...common} rows={rows} className={cn(FIELD, "resize-y py-3 leading-relaxed font-mono text-xs")} />
      ) : (
        <input {...common} className={cn(FIELD, "h-11", isReadOnly && "opacity-60")} />
      )}
      {described && (
        <p id={described} className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>{error ?? hint}</p>
      )}
    </div>
  );
}

export function FlagField({ control, name, label }: { readonly control: Control<EmployeeFormValues>; readonly name: FlagFieldName; readonly label: string }) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-center justify-between gap-4 py-1">
          <label htmlFor={id} className="text-sm text-foreground">{label}</label>
          <Switch id={id} checked={field.value} onCheckedChange={field.onChange} />
        </div>
      )}
    />
  );
}

export function CountField({ register, name, label, max }: { readonly register: UseFormRegister<EmployeeFormValues>; readonly name: CountFieldName; readonly label: string; readonly max: number }) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className={LABEL}>{label}</label>
      <input id={id} type="number" min={0} max={max} step={1} className={cn(FIELD, "h-11")} {...register(name, { valueAsNumber: true, min: 0, max })} />
    </div>
  );
}
