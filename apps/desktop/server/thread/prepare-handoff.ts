import { ENGINES } from "@weave/agent";
import { readGitStatus } from "@weave/core";
import type { ProjectChats } from "../chat/index.ts";
import type { StorageResult } from "../storage/index.ts";
import { buildHandoff } from "./build-handoff.ts";
import { MAX_LOADED_TURNS } from "./constants.ts";
import { decodeTurns } from "./turn-codec.ts";
import type { PreparedHandoff } from "./types.ts";

export interface PrepareHandoffOptions {
  readonly chats: ProjectChats;
  readonly threadId: string;
  readonly engineId: string;
  readonly engineSessionId: string;
  readonly projectDir: string;
}

function engineLabel(engineId: string): string {
  return ENGINES[engineId]?.label ?? engineId;
}

export async function prepareHandoff(options: PrepareHandoffOptions): Promise<StorageResult<PreparedHandoff>> {
  const { chats, threadId, engineId, engineSessionId, projectDir } = options;
  const seat = chats.seat(threadId, engineId);
  const isResumed = seat !== null && seat.engineSessionId === engineSessionId;
  const syncedTurnSeq = isResumed ? seat.syncedTurnSeq : 0;
  const saved = chats.saveSeat(threadId, { engineId, engineSessionId, syncedTurnSeq });
  if (!saved.ok) return saved;

  const page = chats.turnsSince(threadId, syncedTurnSeq, MAX_LOADED_TURNS);
  const decoded = decodeTurns(page.turns);
  const git = await readGitStatus(projectDir);
  const preamble = buildHandoff({
    turns: decoded.turns,
    omittedCount: page.omittedCount,
    unreadableCount: decoded.unreadableSeqs.length,
    workspace: { branch: git.branch, changes: git.changes },
    isResumed,
    labelOf: engineLabel,
  });
  return {
    ok: true,
    value: {
      preamble,
      isResumed,
      turnsHandedOff: page.turns.length + page.omittedCount,
      bytes: preamble === null ? 0 : Buffer.byteLength(preamble, "utf8"),
    },
  };
}
