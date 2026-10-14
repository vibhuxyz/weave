import { Controller, type Control } from "react-hook-form";
import { linesOf, type EmployeeFormValues } from "@/features/employees";
import { ChoiceCard, ChoiceFrame } from "./ChoiceFrame";
import { ENGINE_CHOICES, optionsWithExtras, toggleLine, type Choice } from "./catalog";

interface EngineSelectProps {
  readonly control: Control<EmployeeFormValues>;
  readonly name: "preferredEngines" | "allowedEngines";
  readonly label: string;
  readonly hint?: string;
}

export function EngineSelect({ control, name, label, hint }: EngineSelectProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <ChoiceFrame label={label} hint={hint}>
          <EngineList text={field.value} onChange={field.onChange} />
        </ChoiceFrame>
      )}
    />
  );
}

function orderedEngines(text: string): readonly Choice[] {
  const selected = linesOf(text);
  const choices = optionsWithExtras(ENGINE_CHOICES, text);
  const byValue = new Map(choices.map((choice) => [choice.value, choice]));
  const picked = selected.flatMap((id) => {
    const choice = byValue.get(id);
    return choice === undefined ? [] : [choice];
  });
  const pickedIds = new Set(selected);
  return [...picked, ...choices.filter((choice) => !pickedIds.has(choice.value))];
}

function EngineList({ text, onChange }: { readonly text: string; readonly onChange: (next: string) => void }) {
  const selected = linesOf(text);
  const order = new Map(selected.map((id, index) => [id, index + 1]));
  return (
    <div className="space-y-2">
      {orderedEngines(text).map((choice) => (
        <EngineRow key={choice.value} choice={choice} position={order.get(choice.value)} onToggle={() => onChange(toggleLine(text, choice.value))} />
      ))}
    </div>
  );
}

function EngineRow({ choice, position, onToggle }: { readonly choice: Choice; readonly position: number | undefined; readonly onToggle: () => void }) {
  return (
    <ChoiceCard
      isOn={position !== undefined}
      label={choice.label}
      detail={choice.label === choice.value ? undefined : choice.value}
      aside={position === undefined ? null : <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs tabular-nums text-foreground">{position}</span>}
      onToggle={onToggle}
    />
  );
}
