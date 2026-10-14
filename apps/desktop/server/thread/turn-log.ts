import { capBytes, type Ledger } from "@weave/core";
import type { ProjectChats } from "../chat/index.ts";
import { MAX_STORED_TEXT_BYTES } from "./constants.ts";
import { TurnCapture } from "./turn-capture.ts";
import { encodeFacts } from "./turn-codec.ts";
import type { TurnOutcome } from "./types.ts";

export interface TurnLogOptions {
  readonly ledger: Ledger;
  readonly taskId: string;
  readonly projectDir: string;
  readonly userText: string;
  readonly chats: ProjectChats;
  readonly engineId: string;
  readonly engineSessionId: string;
  readonly threadId: () => string | null;
  readonly onError: (message: string) => void;
}

export interface TurnLog {
  readonly finish: (outcome: TurnOutcome) => void;
  readonly close: () => void;
}

export function startTurnLog(options: TurnLogOptions): TurnLog {
  const { ledger, taskId, projectDir, userText, chats, engineId, engineSessionId, onError } = options;
  const capture = new TurnCapture(taskId, projectDir);
  const unsubscribe = ledger.subscribe(capture.apply);
  let isFinished = false;

  const finish = (outcome: TurnOutcome): void => {
    if (isFinished) return;
    isFinished = true;
    unsubscribe();
    const threadId = options.threadId();
    if (threadId === null) return;
    const { answerText, facts } = capture.snapshot();
    const appended = chats.appendTurn(threadId, {
      engineId,
      userText: capBytes(userText, MAX_STORED_TEXT_BYTES),
      answerText: capBytes(answerText, MAX_STORED_TEXT_BYTES),
      factsJson: encodeFacts(facts),
      outcome,
    });
    const saved = appended.ok
      ? chats.saveSeat(threadId, { engineId, engineSessionId, syncedTurnSeq: appended.value })
      : appended;
    if (!saved.ok) onError(`Cannot record this turn for engine handoff: ${saved.reason}`);
  };

  return { finish, close: unsubscribe };
}
