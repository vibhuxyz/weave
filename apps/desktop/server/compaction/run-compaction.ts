import { errorMessage } from "../shared/index.ts";
import type { ServerMessage } from "../shared/index.ts";
import { classifyCompaction } from "./rules/index.ts";
import { COMPACT_COMMAND, COMPACTION_STALL_TIMEOUT_MS } from "./constants.ts";
import type { CompactionController } from "./controller.ts";
import type { CompactableSession, CompactionOutcome, CompactionTrigger } from "./types.ts";

export interface RunCompactionOptions {
  readonly controller: CompactionController;
  readonly session: CompactableSession;
  readonly operationId: string;
  readonly trigger: CompactionTrigger;
  readonly promptId: string | null;
  readonly send: (msg: ServerMessage) => void;
  readonly readSummary?: (sessionId: string) => Promise<string | null>;
}

export type RunCompactionResult =
  | { readonly kind: "ran"; readonly outcome: CompactionOutcome; readonly error: unknown }
  | { readonly kind: "duplicate" };

async function promptCompact(session: CompactableSession): Promise<{ stopReason: string } | { error: unknown }> {
  try {
    return await session.prompt([{ type: "text", text: COMPACT_COMMAND }], {
      stallTimeoutMs: COMPACTION_STALL_TIMEOUT_MS,
    });
  } catch (error: unknown) {
    return { error };
  }
}

async function readSummarySafely(
  readSummary: RunCompactionOptions["readSummary"],
  sessionId: string,
  send: (msg: ServerMessage) => void,
): Promise<string | null> {
  if (!readSummary) return null;
  try {
    return await readSummary(sessionId);
  } catch (error: unknown) {
    send({ type: "error", message: `Compaction finished, but its summary could not be read for ${sessionId}: ${errorMessage(error)}` });
    return null;
  }
}

export async function runCompaction(options: RunCompactionOptions): Promise<RunCompactionResult> {
  const { controller, session, operationId, trigger, promptId, send } = options;
  const sessionId = session.sessionId;
  const base = { type: "compaction", operationId, sessionId, trigger } as const;

  const begin = controller.begin(operationId, sessionId);
  if (begin === "duplicate") return { kind: "duplicate" };
  if (begin === "busy") {
    const reason = "Another compaction is already running for this connection.";
    send({ ...base, status: "failed", reason });
    return { kind: "ran", outcome: { status: "failed", reason }, error: null };
  }

  send({ ...base, status: "started", promptId, contextBefore: controller.stateFor(sessionId).context });
  const result = await promptCompact(session);
  const captured = controller.end(operationId);
  const outcome: CompactionOutcome =
    "error" in result
      ? { status: "failed", reason: `Cannot compact conversation ${sessionId}: ${errorMessage(result.error)}` }
      : classifyCompaction({
          stopReason: result.stopReason,
          engineText: captured?.engineText ?? "",
          engineStatus: captured?.engineStatus ?? null,
          contextAfter: captured?.contextAfter ?? null,
        });

  if (outcome.status === "completed") {
    controller.recordCompacted(sessionId);
    send({ ...base, ...outcome, summary: await readSummarySafely(options.readSummary, sessionId, send) });
  } else {
    send({ ...base, ...outcome });
  }
  return { kind: "ran", outcome, error: "error" in result ? result.error : null };
}
