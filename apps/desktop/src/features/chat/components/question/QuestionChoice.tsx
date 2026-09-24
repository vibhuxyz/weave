import { cn } from "@/shared/lib";
import type { QuestionField, QuestionFormValue } from "@/features/chat/hooks";
import { FieldLabel } from "./FieldLabel";

type ChoiceField = Extract<QuestionField, { kind: "choice" }>;

function selectedValues(value: QuestionFormValue | undefined): readonly string[] {
  if (value === undefined || typeof value === "boolean") return [];
  if (typeof value === "string") return value ? [value] : [];
  return value;
}

function toggleValue(selected: readonly string[], optionValue: string): readonly string[] {
  return selected.includes(optionValue)
    ? selected.filter((value) => value !== optionValue)
    : [...selected, optionValue];
}

export function QuestionChoice({
  field,
  value,
  isDisabled,
  onChange,
}: {
  field: ChoiceField;
  value: QuestionFormValue | undefined;
  isDisabled: boolean;
  onChange: (key: string, value: QuestionFormValue) => void;
}) {
  const selected = selectedValues(value);
  return (
    <fieldset className="flex flex-col gap-2" disabled={isDisabled}>
      <legend className="mb-2">
        <FieldLabel title={field.title} description={field.description} isRequired={field.isRequired} />
      </legend>
      {field.options.map((option) => {
        const isSelected = selected.includes(option.value);
        return (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs transition-colors",
              isSelected
                ? "border-agent-accent bg-agent-accent-wash"
                : "border-agent-border hover:bg-agent-surface-hover",
            )}
          >
            <input
              type={field.allowsMultiple ? "checkbox" : "radio"}
              name={field.key}
              value={option.value}
              checked={isSelected}
              onChange={() =>
                onChange(field.key, field.allowsMultiple ? toggleValue(selected, option.value) : option.value)
              }
              className="mt-0.5 accent-agent-accent"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-agent-text">{option.label}</span>
              {option.description && <span className="text-agent-text-muted">{option.description}</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
