import {
  isRecord,
  parseJsonBlock,
  readChoice,
  readList,
  readPattern,
  readString,
  readStringList,
  unparsedIssue,
} from "../../shared/index.ts";
import {
  MAX_EXPECTED_OUTPUTS,
  MAX_OUTPUT_CHARS,
  MAX_QUESTION_CHARS,
  MAX_QUESTIONS,
  MIN_QUESTIONS,
  QUESTION_ID_PATTERN,
} from "../constants.ts";
import { QUESTION_KINDS, type Question, type QuestionSet } from "../types.ts";

const MAX_EXCERPT_CHARS = 200;

export type ParseQuestionsResult =
  | { readonly ok: true; readonly questions: QuestionSet }
  | { readonly ok: false; readonly issues: readonly string[] };

function parseQuestion(raw: unknown, where: string, issues: string[]): Question | null {
  if (!isRecord(raw)) {
    issues.push(`${where} must be an object`);
    return null;
  }
  const ctx = { record: raw, where, issues };
  const id = readPattern(ctx, "id", QUESTION_ID_PATTERN);
  const question = readString(ctx, "question", MAX_QUESTION_CHARS);
  const kind = readChoice(ctx, "kind", QUESTION_KINDS);
  const expectedOutputs = readStringList(ctx, "expectedOutputs", {
    maxItems: MAX_EXPECTED_OUTPUTS,
    maxChars: MAX_OUTPUT_CHARS,
  });
  if (id === null || question === null || kind === null) return null;
  return { id, question, kind, expectedOutputs };
}

export function parseQuestions(text: string, request: string): ParseQuestionsResult {
  const block = parseJsonBlock(text);
  if (!block.ok) return { ok: false, issues: [unparsedIssue(block.issue, text, MAX_EXCERPT_CHARS)] };
  if (!isRecord(block.value)) return { ok: false, issues: ["The answer must be a JSON object"] };

  const issues: string[] = [];
  const parsed = readList(
    { record: block.value, where: "questions", issues },
    "questions",
    MAX_QUESTIONS,
    parseQuestion,
  );
  if (parsed.length < MIN_QUESTIONS) issues.push(`"questions" must list at least ${MIN_QUESTIONS} question`);

  const seen = new Set<string>();
  const questions = parsed.filter((question) => {
    if (seen.has(question.id)) {
      issues.push(`questions: "${question.id}" appears more than once`);
      return false;
    }
    seen.add(question.id);
    return true;
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, questions: { request, questions } };
}
