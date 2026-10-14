import { Controller, type Control } from "react-hook-form";
import { linesOf, type EmployeeFormValues } from "@/features/employees";
import { ChoiceCard, ChoiceFrame } from "./ChoiceFrame";
import { optionsWithExtras, toggleLine, type Choice } from "./catalog";

interface CheckSelectProps {
  readonly control: Control<EmployeeFormValues>;
  readonly name: "rules";
  readonly label: string;
  readonly hint?: string;
  readonly options: readonly Choice[];
}

export function CheckSelect({ control, name, label, hint, options }: CheckSelectProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <ChoiceFrame label={label} hint={hint}>
          <RuleList text={field.value} options={options} onChange={field.onChange} />
        </ChoiceFrame>
      )}
    />
  );
}

function RuleList({ text, options, onChange }: { readonly text: string; readonly options: readonly Choice[]; readonly onChange: (next: string) => void }) {
  const selected = new Set(linesOf(text));
  const choices = optionsWithExtras(options, text);
  return (
    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
      {choices.map((choice) => (
        <ChoiceCard key={choice.value} isOn={selected.has(choice.value)} label={choice.label} onToggle={() => onChange(toggleLine(text, choice.value))} />
      ))}
    </div>
  );
}
