import type { QuestionStepOption } from "./types";

export const TOGGLE_OPTIONS: readonly QuestionStepOption[] = [
  { value: "true", label: "Yes", description: null },
  { value: "false", label: "No", description: null },
] as const;

export const MAX_ANSWER_DISPLAY_CHARS = 500;
export const TRUNCATION_MARK = "…";
export const MAX_OPTION_SHORTCUTS = 9;
