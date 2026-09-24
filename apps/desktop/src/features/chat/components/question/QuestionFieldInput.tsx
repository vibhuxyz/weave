import type { QuestionField, QuestionFormValue } from "@/features/chat/hooks";
import { FieldLabel } from "./FieldLabel";
import { QuestionChoice } from "./QuestionChoice";

const INPUT_CLASS =
  "w-full rounded-md border border-agent-border bg-agent-surface-inset px-2.5 py-1.5 text-agent-text text-xs outline-none focus:border-agent-accent";

interface FieldInputProps {
  field: QuestionField;
  value: QuestionFormValue | undefined;
  isDisabled: boolean;
  onChange: (key: string, value: QuestionFormValue) => void;
}

function textOf(value: QuestionFormValue | undefined): string {
  return typeof value === "string" ? value : "";
}

export function QuestionFieldInput({ field, value, isDisabled, onChange }: FieldInputProps) {
  const label = (
    <FieldLabel title={field.title} description={field.description} isRequired={field.isRequired} />
  );
  switch (field.kind) {
    case "choice":
      return <QuestionChoice field={field} value={value} isDisabled={isDisabled} onChange={onChange} />;
    case "text":
      return (
        <label className="flex flex-col gap-1.5">
          {label}
          <textarea
            rows={2}
            value={textOf(value)}
            disabled={isDisabled}
            onChange={(event) => onChange(field.key, event.target.value)}
            className={`${INPUT_CLASS} resize-y`}
          />
        </label>
      );
    case "number":
      return (
        <label className="flex flex-col gap-1.5">
          {label}
          <input
            type="number"
            step={field.isInteger ? 1 : "any"}
            value={textOf(value)}
            disabled={isDisabled}
            onChange={(event) => onChange(field.key, event.target.value)}
            className={INPUT_CLASS}
          />
        </label>
      );
    case "toggle":
      return (
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={value === true}
            disabled={isDisabled}
            onChange={(event) => onChange(field.key, event.target.checked)}
            className="mt-0.5 accent-agent-accent"
          />
          {label}
        </label>
      );
    default: {
      const unreachable: never = field;
      return unreachable;
    }
  }
}
