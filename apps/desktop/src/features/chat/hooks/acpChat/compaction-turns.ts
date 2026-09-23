import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { ServerMessage } from "../../../../../server/index.ts";
import {
  attachSummary,
  recordNoticeUsage,
  restoredNotice,
  settleNotice,
  startNotice,
  toContextUsage,
} from "@/features/chat/compaction";
import type { CompactionNotice, CompactionSettlement, ContextUsage } from "@/features/chat/compaction";
import type { ChatTurn } from "./types";

type CompactionMessage = Extract<ServerMessage, { readonly type: "compaction" }>;
type StartedMessage = Extract<CompactionMessage, { readonly status: "started" }>;
type SettledMessage = Exclude<CompactionMessage, { readonly status: "started" }>;

function toSettlement(message: SettledMessage): CompactionSettlement {
  switch (message.status) {
    case "completed":
      return { status: "completed", contextAfter: message.contextAfter, summary: message.summary };
    case "failed":
      return { status: "failed", reason: message.reason };
    case "cancelled":
      return { status: "cancelled" };
    default: {
      const exhaustive: never = message;
      return exhaustive;
    }
  }
}

function withNotice(turn: ChatTurn, notice: CompactionNotice, usage: ContextUsage | null): ChatTurn {
  if (!usage) return { ...turn, compaction: notice };
  return {
    ...turn,
    compaction: notice,
    usage: { ...turn.usage, contextUsed: usage.contextTokens, contextSize: usage.contextLimit },
  };
}

function updateNotice(
  turns: readonly ChatTurn[],
  operationId: string,
  mutate: (notice: CompactionNotice) => CompactionNotice,
): ChatTurn[] | null {
  const index = turns.findIndex((turn) => turn.id === operationId && turn.compaction);
  const turn = turns[index];
  if (!turn?.compaction) return null;
  const nextNotice = mutate(turn.compaction);
  if (nextNotice === turn.compaction) return null;
  const next = [...turns];
  next[index] = withNotice(turn, nextNotice, nextNotice.status === "failed" ? null : nextNotice.contextAfter);
  return next;
}

export function applyCompactionStarted(turns: readonly ChatTurn[], message: StartedMessage, now: number): ChatTurn[] | null {
  if (turns.some((turn) => turn.id === message.operationId)) return null;
  const noticeTurn: ChatTurn = {
    id: message.operationId,
    role: "notice",
    text: "",
    thought: "",
    tools: [],
    compaction: startNotice(message, now),
  };
  const promptIndex = message.promptId ? turns.findIndex((turn) => turn.id === message.promptId) : -1;
  if (promptIndex < 0) return [...turns, noticeTurn];
  return [...turns.slice(0, promptIndex), noticeTurn, ...turns.slice(promptIndex)];
}

export function applyCompactionSettled(
  turns: readonly ChatTurn[],
  message: SettledMessage,
  now: number,
): ChatTurn[] | null {
  return updateNotice(turns, message.operationId, (notice) => settleNotice(notice, toSettlement(message), now));
}

export function applyCompactionUpdate(
  turns: readonly ChatTurn[],
  operationId: string,
  update: SessionUpdate,
): ChatTurn[] | null {
  if (update.sessionUpdate !== "usage_update") return null;
  return updateNotice(turns, operationId, (notice) => recordNoticeUsage(notice, toContextUsage(update.used, update.size)));
}

export function failRunningNotices(turns: readonly ChatTurn[], reason: string, now: number): ChatTurn[] | null {
  let changed = false;
  const next = turns.map((turn) => {
    if (turn.compaction?.status !== "running") return turn;
    changed = true;
    return { ...turn, compaction: settleNotice(turn.compaction, { status: "failed", reason }, now) };
  });
  return changed ? next : null;
}

export function withdrawPromptTurn(turns: readonly ChatTurn[], promptId: string): ChatTurn[] | null {
  const next = turns.filter((turn) => turn.id !== promptId);
  return next.length === turns.length ? null : next;
}

export function applyReplayedSummary(
  turns: readonly ChatTurn[],
  restore: { readonly summary: string; readonly noticeId: string; readonly now: number },
): ChatTurn[] {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn?.compaction?.status !== "completed") continue;
    if (turn.compaction.summary) break;
    const next = [...turns];
    next[index] = { ...turn, compaction: attachSummary(turn.compaction, restore.summary) };
    return next;
  }
  const noticeTurn: ChatTurn = {
    id: restore.noticeId,
    role: "notice",
    text: "",
    thought: "",
    tools: [],
    compaction: restoredNotice(restore.noticeId, restore.summary, restore.now),
  };
  return [...turns, noticeTurn];
}
