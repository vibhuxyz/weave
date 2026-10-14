import type { PromptBlock } from "@weave/agent";
import { buildPromptBlocks, composeSystemPrompt } from "../../chat/index.ts";
import { MAX_CONTINUATIONS, MAX_SILENT_CONTINUATIONS } from "./constants.ts";

const RESUME_CUT_OFF = "Continue.";

const AUTOMATIC_NOTE = "Weave sent this automatically; it is not a new instruction from the user.";

const FINISH_PARTIAL_ANSWER = `${AUTOMATIC_NOTE} Your last turn ended before you answered. Finish the user's most recent request and do not start work they did not ask for. When it is fully done, reply with a short summary of what changed and anything still open.`;

const WRAP_UP_UNFINISHED = `${AUTOMATIC_NOTE} This is the last automatic continuation. Finish the step you are on, then reply with a summary of what is done and exactly what is still left.`;

export function continuationPrompt(attempt: number): string {
  return attempt >= MAX_CONTINUATIONS ? WRAP_UP_UNFINISHED : FINISH_PARTIAL_ANSWER;
}

export interface ContinuationBlocksInput {
  readonly attempt: number;
  readonly hasTextSincePrompt: boolean;
  readonly persona?: string;
}

export function continuationBlocks({
  attempt,
  hasTextSincePrompt,
  persona,
}: ContinuationBlocksInput): readonly PromptBlock[] {
  if (!hasTextSincePrompt && attempt < MAX_CONTINUATIONS) return buildPromptBlocks(RESUME_CUT_OFF);
  return buildPromptBlocks(
    composeSystemPrompt(continuationPrompt(attempt), { pendingPreamble: null, persona }),
  );
}

export function continuationNotice(continuations: number, engineLabel: string): string | null {
  return continuations > MAX_SILENT_CONTINUATIONS
    ? `Weave auto-continued this turn ${continuations} times because ${engineLabel} kept ending its turns early. Check that the result is what you asked for.`
    : null;
}
