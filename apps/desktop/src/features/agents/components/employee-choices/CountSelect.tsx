import { useId } from "react";
import { Controller, type Control } from "react-hook-form";
import type { EmployeeFormValues } from "@/features/employees";
import { FIELD, LABEL } from "@/features/projects/components";
import { cn } from "@/shared/lib";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui";
import { withCurrentCount } from "./catalog";

interface CountSelectProps {
  readonly control: Control<EmployeeFormValues>;
  readonly name: "memoryMaxEntries" | "memoryRecallCount";
  readonly label: string;
  readonly presets: readonly number[];
  readonly max: number;
}

export function CountSelect({ control, name, label, presets, max }: CountSelectProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => <CountMenu label={label} value={field.value} max={max} presets={presets} onChange={field.onChange} />}
    />
  );
}

function CountMenu({ label, value, max, presets, onChange }: { readonly label: string; readonly value: number; readonly max: number; readonly presets: readonly number[]; readonly onChange: (next: number) => void }) {
  const id = useId();
  const options = withCurrentCount(presets, value, max);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className={LABEL}>{label}</label>
      <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
        <SelectTrigger id={id} className={cn(FIELD, "h-11 w-full rounded-xl")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          {options.map((option) => <SelectItem key={option} value={String(option)}>{option}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
