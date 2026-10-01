import { randomUUID } from "node:crypto";
import type { QuestionAsker } from "@weave/agent";
import { COMMIT_CHOICE, DECISION_FIELD, KEEP_CHOICE } from "./constants.ts";

export async function askToCommit(ask: QuestionAsker, message: string): Promise<boolean> {
  const response = await ask({
    mode: "form",
    requestId: randomUUID(),
    message,
    requestedSchema: {
      type: "object",
      properties: {
        [DECISION_FIELD]: {
          type: "string",
          title: "Team run",
          oneOf: [
            { const: COMMIT_CHOICE, title: "Commit and start the team" },
            { const: KEEP_CHOICE, title: "Keep working in this chat" },
          ],
        },
      },
      required: [DECISION_FIELD],
    },
  });
  return response.action === "accept" && response.content?.[DECISION_FIELD] === COMMIT_CHOICE;
}
