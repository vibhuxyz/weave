import type { ServerMessage } from "../shared/index.ts";
import { summarizeAnswers, toElicitationContent } from "./answers.ts";
import type { PendingQuestions } from "./pending.ts";
import { isRecord } from "./text.ts";

export interface AnsweredQuestion {
  readonly question: string;
  readonly answer: string;
}

export interface AnswerQuestionInput {
  readonly pending: PendingQuestions;
  readonly requestId: string;
  readonly answers: unknown;
  readonly send: (msg: ServerMessage) => void;
  readonly onAnswered: (answered: AnsweredQuestion) => void;
}

export function answerQuestion({ pending, requestId, answers, send, onAnswered }: AnswerQuestionInput): void {
  const entry = pending.get(requestId);
  if (!entry) return;
  if (answers === null) {
    pending.settle(requestId, { action: "decline" });
    return;
  }
  const result = isRecord(answers)
    ? toElicitationContent(entry.fields, answers)
    : { ok: false as const, message: "Answers must be an object" };
  if (!result.ok) {
    send({ type: "question-invalid", requestId, message: result.message });
    return;
  }
  pending.settle(requestId, { action: "accept", content: result.content });
  const summary = summarizeAnswers(entry.fields, result.content);
  if (summary) onAnswered({ question: entry.message, answer: summary });
}
