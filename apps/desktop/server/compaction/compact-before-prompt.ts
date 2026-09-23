import { randomUUID } from "node:crypto";
import type { ServerMessage } from "../shared/index.ts";
import type { CompactionController } from "./controller.ts";
import { runCompaction } from "./run-compaction.ts";
import type { CompactableSession } from "./types.ts";

export interface CompactBeforePromptOptions {
  readonly controller: CompactionController;
  readonly session: CompactableSession;
  readonly promptId: string | undefined;
  readonly threshold: unknown;
  readonly send: (msg: ServerMessage) => void;
  readonly newOperationId?: () => string;
  readonly readSummary?: (sessionId: string) => Promise<string | null>;
}

export type CompactBeforePromptResult =
  | { readonly kind: "proceed"; readonly error: unknown }
  | { readonly kind: "withdrawn" };

export async function compactBeforePrompt(options: CompactBeforePromptOptions): Promise<CompactBeforePromptResult> {
  const { controller, session, promptId, threshold, send, readSummary, newOperationId = randomUUID } = options;
  if (!promptId || !controller.shouldAutoCompact(session.sessionId, threshold)) {
    return { kind: "proceed", error: null };
  }
  const result = await runCompaction({
    controller,
    session,
    operationId: newOperationId(),
    trigger: "automatic",
    promptId,
    send,
    readSummary,
  });
  if (result.kind === "ran" && result.outcome.status === "cancelled") {
    send({ type: "prompt-withdrawn", promptId });
    return { kind: "withdrawn" };
  }
  return { kind: "proceed", error: result.kind === "ran" ? result.error : null };
}
