import { isRecord, parseJsonBlock, readStringList, type FieldContext } from "../shared/index.ts";
import { MAX_NOTE_CHARS, MAX_NOTES_PER_KIND, TASK_NOTES_KEY } from "./constants.ts";

export interface TaskNotes {
  readonly decisions: readonly string[];
  readonly discoveries: readonly string[];
  readonly openQuestions: readonly string[];
  readonly issues: readonly string[];
}

const JSON_FENCES = /```json\r?\n([\s\S]*?)\r?\n```/g;
const LIMITS = { maxItems: MAX_NOTES_PER_KIND, maxChars: MAX_NOTE_CHARS };
const EMPTY: TaskNotes = { decisions: [], discoveries: [], openQuestions: [], issues: [] };

function parseNotes(raw: unknown): TaskNotes {
  if (!isRecord(raw)) return { ...EMPTY, issues: ["taskNotes must be an object"] };
  const issues: string[] = [];
  const ctx: FieldContext = { record: raw, where: "taskNotes", issues };
  return {
    decisions: readStringList(ctx, "decisions", LIMITS),
    discoveries: readStringList(ctx, "discoveries", LIMITS),
    openQuestions: readStringList(ctx, "openQuestions", LIMITS),
    issues,
  };
}

export function extractTaskNotes(message: string): TaskNotes {
  const found = [...message.matchAll(JSON_FENCES)].flatMap((match) => {
    const parsed = parseJsonBlock(match[1] ?? "");
    return parsed.ok && isRecord(parsed.value) && TASK_NOTES_KEY in parsed.value ? [parseNotes(parsed.value[TASK_NOTES_KEY])] : [];
  });
  return found.reduce(
    (all, notes) => ({
      decisions: [...all.decisions, ...notes.decisions],
      discoveries: [...all.discoveries, ...notes.discoveries],
      openQuestions: [...all.openQuestions, ...notes.openQuestions],
      issues: [...all.issues, ...notes.issues],
    }),
    EMPTY,
  );
}

export const TASK_NOTES_INSTRUCTION =
  "When you make a decision, learn a fact the next worker needs, or hit a question only a person can answer, add a block to your reply: " +
  '```json\n{ "taskNotes": { "decisions": ["…"], "discoveries": ["…"], "openQuestions": ["…"] } }\n```' +
  " Weave keeps these in the task state, so they survive a restart or a switch to another engine.";
