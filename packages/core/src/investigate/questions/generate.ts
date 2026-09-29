import { parseQuestions } from "./parse.ts";
import { buildQuestionsPrompt, buildQuestionsRepairPrompt } from "./prompt.ts";
import type { QuestionOutcome } from "../types.ts";

export interface InvestigationRequest {
  readonly request: string;
  readonly projectContext: string | null;
  readonly runTurn: (prompt: string, signal?: AbortSignal) => Promise<string>;
  readonly signal?: AbortSignal;
}

export async function askInvestigationQuestions(input: InvestigationRequest): Promise<QuestionOutcome> {
  const prompt = buildQuestionsPrompt({ request: input.request, projectContext: input.projectContext });
  const first = parseQuestions(await input.runTurn(prompt, input.signal), input.request);
  if (first.ok) return { ok: true, questions: first.questions, attempts: 1 };
  if (input.signal?.aborted) return { ok: false, issues: first.issues, attempts: 1 };

  const repair = buildQuestionsRepairPrompt(prompt, first.issues);
  const second = parseQuestions(await input.runTurn(repair, input.signal), input.request);
  if (second.ok) return { ok: true, questions: second.questions, attempts: 2 };
  return { ok: false, issues: second.issues, attempts: 2 };
}
