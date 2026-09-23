import { runCompaction } from "../compaction/index.ts";
import type { CompactionController } from "../compaction/index.ts";
import { summaryReaderFor } from "../history/index.ts";
import type { DesktopSessionManager } from "../session/index.ts";
import { errorMessage } from "../shared/index.ts";
import type { ServerMessage } from "../shared/index.ts";

export interface CompactOptions {
  readonly operationId: string;
  readonly projectDir: string;
  readonly sessionMgr: DesktopSessionManager;
  readonly compaction: CompactionController;
  readonly send: (msg: ServerMessage) => void;
}

export async function handleCompact({ operationId, projectDir, sessionMgr, compaction, send }: CompactOptions): Promise<void> {
  const supervisor = sessionMgr.supervisor;
  if (!supervisor) {
    send({ type: "error", message: `Cannot compact: no engine session is open (operation ${operationId}).` });
    return;
  }
  try {
    await supervisor.reviveCurrent();
  } catch (err: unknown) {
    if (sessionMgr.handleAuthError(err, sessionMgr.currentEngineId)) return;
    send({ type: "error", message: `Cannot start ${sessionMgr.currentEngineId} to compact: ${errorMessage(err)}` });
    return;
  }
  const session = supervisor.current;
  if (!compaction.stateFor(session.sessionId).supportsCompaction) {
    send({ type: "error", message: `Cannot compact: ${sessionMgr.currentEngineId} does not offer /compact for this session.` });
    return;
  }
  const result = await runCompaction({
    controller: compaction,
    session,
    operationId,
    trigger: "manual",
    promptId: null,
    send,
    readSummary: summaryReaderFor(sessionMgr.currentEngineId, projectDir),
  });
  if (result.kind === "ran" && result.error) sessionMgr.handleAuthError(result.error, sessionMgr.currentEngineId);
}
