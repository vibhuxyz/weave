import type { KeyboardEvent } from "react";
import { cn } from "@/shared/lib";
import { ShortcutKey } from "./OptionRow";

const PLACEHOLDER = "Type your own answer here";

export function AnswerInput({
  label,
  value,
  shortcut,
  inputType,
  isDisabled,
  onChange,
  onSubmit,
}: {
  label: string | null;
  value: string;
  shortcut: number | null;
  inputType: "text" | "number";
  isDisabled: boolean;
  onChange: (text: string) => void;
  onSubmit: () => void;
}) {
  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onSubmit();
  };
  return (
    <label className={cn("flex flex-col gap-2 rounded-lg", label && "bg-agent-surface-inset px-3 py-2.5")}>
      {label && (
        <span className="flex items-center justify-between gap-3">
          <span className="text-agent-text-strong text-sm">{label}</span>
          {shortcut !== null && <ShortcutKey value={shortcut} />}
        </span>
      )}
      <input
        type={inputType}
        value={value}
        disabled={isDisabled}
        placeholder={PLACEHOLDER}
        aria-label={label ?? PLACEHOLDER}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={submitOnEnter}
        data-question-input
        className="w-full rounded-md border border-agent-border bg-agent-surface-base px-3 py-2 text-agent-text text-sm outline-none placeholder:text-agent-text-faint focus:border-agent-border-strong"
      />
    </label>
  );
}
