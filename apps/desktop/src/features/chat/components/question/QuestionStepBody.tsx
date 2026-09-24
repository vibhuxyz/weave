import {
  MAX_OPTION_SHORTCUTS,
  selectedValues,
  textOf,
  type QuestionFormValues,
  type QuestionStep,
} from "@/features/chat/hooks";
import { AnswerInput } from "./AnswerInput";
import { OptionRow } from "./OptionRow";

const OTHER_LABEL = "Other";

function shortcutFor(index: number): number | null {
  return index < MAX_OPTION_SHORTCUTS ? index + 1 : null;
}

export function QuestionStepBody({
  step,
  values,
  isDisabled,
  onPick,
  onText,
  onSubmit,
}: {
  step: QuestionStep;
  values: QuestionFormValues;
  isDisabled: boolean;
  onPick: (value: string) => void;
  onText: (text: string) => void;
  onSubmit: () => void;
}) {
  const { field, options, otherKey } = step;
  if (options.length === 0) {
    return (
      <AnswerInput
        label={null}
        value={textOf(values[step.key])}
        shortcut={null}
        inputType={field.kind === "number" ? "number" : "text"}
        isDisabled={isDisabled}
        onChange={onText}
        onSubmit={onSubmit}
      />
    );
  }
  const selected = selectedValues(values[step.key]);
  const allowsMultiple = field.kind === "choice" && field.allowsMultiple;
  return (
    <div role={allowsMultiple ? "group" : "radiogroup"} aria-label={step.heading} className="flex flex-col gap-1.5">
      {options.map((option, index) => (
        <OptionRow
          key={option.value}
          option={option}
          shortcut={shortcutFor(index)}
          isSelected={selected.includes(option.value)}
          allowsMultiple={allowsMultiple}
          isDisabled={isDisabled}
          onPick={onPick}
        />
      ))}
      {otherKey !== null && (
        <AnswerInput
          label={OTHER_LABEL}
          value={textOf(values[otherKey])}
          shortcut={shortcutFor(options.length)}
          inputType="text"
          isDisabled={isDisabled}
          onChange={onText}
          onSubmit={onSubmit}
        />
      )}
    </div>
  );
}
