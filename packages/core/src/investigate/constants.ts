export const MAX_QUESTIONS = 10;
export const MIN_QUESTIONS = 1;
export const MAX_QUESTION_CHARS = 300;
export const MAX_EXPECTED_OUTPUTS = 5;
export const MAX_OUTPUT_CHARS = 120;
export const QUESTION_ID_PATTERN = /^D[1-9][0-9]?$/;

export const MAX_SCOPE_FILES = 8;
export const MAX_SCOPE_SYMBOLS = 12;
export const MAX_SCOPE_REASONS = 6;

export const MAX_FINDING_CHARS = 500;
export const MAX_HYPOTHESIS_CHARS = 300;
export const MAX_EVIDENCE_PER_FINDING = 10;
export const MAX_DETAIL_CHARS = 200;
export const MAX_SYMBOL_CHARS = 120;

export const MAX_ROOT_CAUSES = 5;

export const CONFIDENCE_WEIGHT: Readonly<Record<string, number>> = {
  low: 1,
  medium: 2,
  high: 3,
};
