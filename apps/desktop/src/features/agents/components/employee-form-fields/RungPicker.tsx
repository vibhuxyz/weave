import { Controller, type Control } from "react-hook-form";
import { VERIFICATION_RUNGS } from "@weave/protocol";
import type { EmployeeFormValues } from "@/features/employees";
import { LABEL } from "@/features/projects/components";
import { cn } from "@/shared/lib";

interface RungPickerProps {
  readonly control: Control<EmployeeFormValues>;
  readonly name: "requiredRungs" | "preferredRungs";
  readonly label: string;
}

export function RungPicker({ control, name, label }: RungPickerProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div role="group" aria-label={label} className="space-y-2">
          <p className={LABEL}>{label}</p>
          <div className="flex flex-wrap gap-1.5">
            {VERIFICATION_RUNGS.map((rung) => {
              const isOn = field.value.includes(rung);
              return (
                <button
                  key={rung}
                  type="button"
                  aria-pressed={isOn}
                  onClick={() => field.onChange(isOn ? field.value.filter((item) => item !== rung) : [...field.value, rung])}
                  className={cn("rounded-full border px-3 py-1 text-xs transition-colors", isOn ? "border-primary bg-primary/15 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground")}
                >
                  {rung}
                </button>
              );
            })}
          </div>
        </div>
      )}
    />
  );
}
