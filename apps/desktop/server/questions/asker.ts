import type { QuestionAsker } from "@weave/agent";
import type { ServerMessage } from "../shared/index.ts";
import { MAX_MESSAGE_CHARS } from "./constants.ts";
import { toQuestionFields } from "./fields.ts";
import type { PendingQuestions } from "./pending.ts";
import { capText } from "./text.ts";

export interface CreateUserAskerOptions {
  readonly pending: PendingQuestions;
  readonly send: (msg: ServerMessage) => void;
}

export function createUserAsker({ pending, send }: CreateUserAskerOptions): QuestionAsker {
  return (request) =>
    new Promise((resolve) => {
      const { fields, notices } = toQuestionFields(request.requestedSchema);
      const message = capText(request.message, MAX_MESSAGE_CHARS);
      const entry = pending.open({ message, fields }, (response) => {
        send({ type: "question-closed", requestId: entry.requestId });
        resolve(response);
      });
      send({
        type: "question-request",
        requestId: entry.requestId,
        message,
        fields,
        notices,
      });
    });
}
