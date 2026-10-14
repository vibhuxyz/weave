import type { PromptBlock } from "@weave/agent";
import type { Ledger } from "@weave/core";
import type {
  AnswerStatus,
  TaskExecutionStatus,
  TurnStatus,
  WeaveEvent,
} from "@weave/protocol";

export const MAX_CONTINUATIONS = 20;
export const MAX_STALLED_CONTINUATIONS = 3;
const CONTINUABLE_STOPS = new Set(["end_turn", "max_tokens", "max_turn_requests"]);

const CONTINUE_UNFINISHED =
  "Your last turn stopped before the request was done. Continue the user's original request from where you left off, using tools as needed. When it is fully done, reply with a short summary of what changed and anything still open.";

const WRAP_UP_UNFINISHED =
  "This is the last automatic continuation. Finish the step you are on, then reply with a summary of what is done and exactly what is still left.";

export function continuationPrompt(attempt: number): string {
  return attempt >= MAX_CONTINUATIONS ? WRAP_UP_UNFINISHED : CONTINUE_UNFINISHED;
}

export interface TurnProgress {
  readonly usedTools: boolean;
  readonly hasUserFacingText: boolean;
  readonly hasFinalAnswer: boolean;
  readonly hasAnswer: boolean;
  readonly toolCalls: number;
  readonly answerStatus: AnswerStatus;
  readonly turnStatus: TurnStatus;
  readonly taskStatus: TaskExecutionStatus;
  readonly stopReason?: string;
}

interface UpdateFields {
  readonly sessionUpdate?: unknown;
  readonly content?: { readonly type?: unknown; readonly text?: unknown };
}

export function shouldContinueUnfinished(
  stopReason: string,
  progress: Partial<TurnProgress>,
  isCancelled = false,
): boolean {
  if (isCancelled) return false;
  const isFinal = progress.hasFinalAnswer ?? progress.hasAnswer ?? false;
  return CONTINUABLE_STOPS.has(stopReason) && (progress.usedTools === true) && !isFinal;
}

function answerText(update: UpdateFields): string {
  const content = update.content;
  return update.sessionUpdate === "agent_message_chunk" &&
    content?.type === "text" &&
    typeof content.text === "string"
    ? content.text
    : "";
}

export function watchUnfinished(
  ledger: Ledger,
  taskId: string,
): {
  readonly snapshot: () => TurnProgress;
  readonly recordTurnEnd: (stopReason: string) => void;
  readonly reset: () => void;
  readonly close: () => void;
} {
  let usedTools = false;
  let toolCalls = 0;
  let totalTextChars = 0;
  let textAfterLastToolChars = 0;
  let stopReason: string | undefined;

  const deriveProgress = (): TurnProgress => {
    const hasUserFacingText = totalTextChars > 0;
    const hasFinalAnswer = usedTools ? textAfterLastToolChars > 0 : hasUserFacingText;

    const answerStatus: AnswerStatus = hasFinalAnswer
      ? "final"
      : hasUserFacingText
        ? "partial"
        : "pending";

    const turnStatus: TurnStatus =
      stopReason === "end_turn"
        ? "completed"
        : stopReason === "max_tokens" || stopReason === "max_turn_requests"
          ? "interrupted"
          : stopReason
            ? "failed"
            : "active";

    const taskStatus: TaskExecutionStatus = hasFinalAnswer ? "completed" : "in_progress";

    return {
      usedTools,
      hasUserFacingText,
      hasFinalAnswer,
      hasAnswer: hasFinalAnswer,
      toolCalls,
      answerStatus,
      turnStatus,
      taskStatus,
      stopReason,
    };
  };

  const unsubscribe = ledger.subscribe((event: WeaveEvent) => {
    if (event.type !== "agent.message" || event.taskId !== taskId) return;
    const update = event.update as UpdateFields;
    if (update.sessionUpdate === "tool_call") {
      usedTools = true;
      toolCalls += 1;
      textAfterLastToolChars = 0;
    } else if (update.sessionUpdate === "tool_call_update") {
      usedTools = true;
    }

    const chunk = answerText(update).trim();
    if (chunk.length > 0) {
      totalTextChars += chunk.length;
      if (usedTools) {
        textAfterLastToolChars += chunk.length;
      }
    }
  });

  return {
    snapshot: () => deriveProgress(),
    recordTurnEnd: (reason: string) => {
      stopReason = reason;
    },
    reset: () => {
      usedTools = false;
      toolCalls = 0;
      totalTextChars = 0;
      textAfterLastToolChars = 0;
      stopReason = undefined;
    },
    close: unsubscribe,
  };
}

export interface PromptUntilAnswerOptions<T extends { readonly stopReason: string }> {
  readonly run: (blocks: readonly PromptBlock[]) => Promise<T>;
  readonly first: readonly PromptBlock[];
  readonly followUp: readonly PromptBlock[] | ((continuationIndex: number) => readonly PromptBlock[]);
  readonly activity: {
    readonly snapshot: () => TurnProgress;
    readonly reset: () => void;
    readonly recordTurnEnd?: (stopReason: string) => void;
  };
  readonly isCancelled?: () => boolean;
  readonly beforeContinuation?: (attempt: number) => Promise<void>;
  readonly timeoutMs?: number;
}

export interface PromptUntilAnswerResult<T> {
  readonly result: T;
  readonly continuations: number;
  readonly stillUnfinished: boolean;
  readonly progress: TurnProgress;
  readonly timedOut: boolean;
}

export async function promptUntilAnswer<T extends { readonly stopReason: string }>(
  input: PromptUntilAnswerOptions<T>,
): Promise<PromptUntilAnswerResult<T>> {
  input.activity.reset();
  const deadline = input.timeoutMs ? Date.now() + input.timeoutMs : undefined;

  let result = await input.run(input.first);
  input.activity.recordTurnEnd?.(result.stopReason);
  let continuations = 0;
  let stalledContinuations = 0;
  let timedOut = false;

  while (
    shouldContinueUnfinished(result.stopReason, input.activity.snapshot(), input.isCancelled?.()) &&
    continuations < MAX_CONTINUATIONS &&
    stalledContinuations < MAX_STALLED_CONTINUATIONS
  ) {
    if (deadline && Date.now() >= deadline) {
      timedOut = true;
      break;
    }

    continuations += 1;
    await input.beforeContinuation?.(continuations);

    const toolCallsBefore = input.activity.snapshot().toolCalls;
    const blocks = typeof input.followUp === "function" ? input.followUp(continuations) : input.followUp;
    result = await input.run(blocks);
    input.activity.recordTurnEnd?.(result.stopReason);
    stalledContinuations = input.activity.snapshot().toolCalls > toolCallsBefore ? 0 : stalledContinuations + 1;
  }

  const progress = input.activity.snapshot();
  const stillUnfinished =
    timedOut ||
    shouldContinueUnfinished(
      result.stopReason,
      progress,
      input.isCancelled?.(),
    );

  return { result, continuations, stillUnfinished, progress, timedOut };
}
