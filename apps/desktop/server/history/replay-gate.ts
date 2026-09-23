import type { SessionUpdate } from "@weave/protocol";
import type { ServerMessage } from "../shared/index.ts";
import { summaryFromReplayText } from "./compact-summary.ts";
import type { HistoryArchive } from "./types.ts";

export interface ReplayDecision {
  readonly forward: boolean;
  readonly messages: readonly ServerMessage[];
}

const PASS_THROUGH: ReplayDecision = { forward: true, messages: [] };

interface ArmedReplay {
  readonly sessionId: string;
  readonly archive: HistoryArchive | null;
  readonly hasSeenFirstUpdate: boolean;
}

function replayedSummary(update: SessionUpdate): string | null {
  if (update.sessionUpdate !== "user_message_chunk" || update.content.type !== "text") return null;
  return summaryFromReplayText(update.content.text);
}

export class ReplayGate {
  private armed: ArmedReplay | null = null;

  arm(sessionId: string, archive: HistoryArchive | null): void {
    this.armed = { sessionId, archive, hasSeenFirstUpdate: false };
  }

  disarm(): void {
    this.armed = null;
  }

  filter(update: SessionUpdate, sessionId: string | undefined): ReplayDecision {
    const armed = this.armed;
    if (!armed || sessionId !== armed.sessionId) return PASS_THROUGH;
    const summary = replayedSummary(update);
    const isFirst = !armed.hasSeenFirstUpdate;
    this.armed = { ...armed, hasSeenFirstUpdate: true };
    if (!summary) return PASS_THROUGH;

    const restore: ServerMessage[] =
      isFirst && armed.archive
        ? [{ type: "history-archive", sessionId, turns: armed.archive.turns, droppedTurnCount: armed.archive.droppedTurnCount }]
        : [];
    return { forward: false, messages: [...restore, { type: "compaction-summary", sessionId, summary }] };
  }
}
