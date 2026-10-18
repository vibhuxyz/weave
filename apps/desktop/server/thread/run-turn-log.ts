import { capBytes, RESERVED_TASK_IDS } from "@weave/core";
import type { ProjectChats } from "../chat/index.ts";
import type { RunOutcome, ServerMessage } from "../shared/index.ts";
import { MAX_CAPTURED_ANSWER_CHARS, MAX_RUN_ANSWER_CHARS_PER_TASK, MAX_STORED_TEXT_BYTES, MAX_TURN_FILES } from "./constants.ts";
import { renderRunBrief } from "./run-brief.ts";
import { encodeFacts } from "./turn-codec.ts";
import type { TurnOutcome } from "./types.ts";

export interface RunTurnLogOptions {
  readonly request: string;
  readonly engineId: string;
  readonly chats: ProjectChats;
  readonly bindThread: (request: string) => string | null;
  readonly announce: (brief: string) => void;
  readonly onError: (message: string) => void;
}

export interface RunTurnLog {
  readonly observe: (message: ServerMessage) => void;
}

function turnOutcomeOf(outcome: RunOutcome): TurnOutcome {
  if (outcome.status === "no-change-needed") return "completed";
  if (outcome.status !== "ran") return "error";
  if (outcome.result === "cancelled") return "cancelled";
  return outcome.result === "failed" ? "unfinished" : "completed";
}

function answerOf(textByTask: ReadonlyMap<string, string>): string {
  const sections = [...textByTask].map(([taskId, text]) => `[${taskId}] ${text.trim()}`);
  return sections.join("\n\n").slice(-MAX_CAPTURED_ANSWER_CHARS);
}

export function createRunTurnLog(options: RunTurnLogOptions): RunTurnLog {
  const textByTask = new Map<string, string>();
  const files = new Set<string>();

  const collect = (message: ServerMessage): void => {
    if (message.type !== "run-update") return;
    const { update } = message;
    if (update.kind === "file" && files.size < MAX_TURN_FILES) files.add(update.path);
    if (update.kind !== "text" || RESERVED_TASK_IDS.includes(update.taskId)) return;
    const joined = (textByTask.get(update.taskId) ?? "") + update.text;
    textByTask.set(update.taskId, joined.slice(-MAX_RUN_ANSWER_CHARS_PER_TASK));
  };

  const finish = (outcome: RunOutcome): void => {
    const answerText = answerOf(textByTask);
    if (answerText === "" && files.size === 0) return;
    const threadId = options.bindThread(options.request);
    if (threadId === null) return;
    const turnOutcome = turnOutcomeOf(outcome);
    options.announce(renderRunBrief({ request: options.request, outcome: turnOutcome, answerText, files: [...files] }));
    const appended = options.chats.appendTurn(threadId, {
      engineId: options.engineId,
      userText: capBytes(options.request, MAX_STORED_TEXT_BYTES),
      answerText: capBytes(answerText, MAX_STORED_TEXT_BYTES),
      factsJson: encodeFacts({ files: [...files], fileCount: files.size, commands: [], failures: [] }),
      outcome: turnOutcome,
    });
    if (!appended.ok) options.onError(`Cannot record this run for follow-up questions: ${appended.reason}`);
  };

  return {
    observe: (message) => {
      if (message.type === "run-finished") finish(message.outcome);
      else collect(message);
    },
  };
}
