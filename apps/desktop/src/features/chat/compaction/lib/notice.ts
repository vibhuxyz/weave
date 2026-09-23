import { MAX_NOTICE_DETAIL_CHARS, PERCENT_SCALE } from "./constants";
import { contextUsageRatio } from "./context-usage";
import type { CompactionNotice, CompactionSettlement, CompactionTrigger, ContextUsage } from "./types";

export function startNotice(
  start: {
    readonly operationId: string;
    readonly trigger: CompactionTrigger;
    readonly contextBefore: ContextUsage | null;
  },
  now: number,
): CompactionNotice {
  return {
    ...start,
    origin: "live",
    summary: null,
    status: "running",
    startedAt: now,
    settledAt: null,
    contextAfter: null,
    failureReason: null,
  };
}

export function restoredNotice(operationId: string, summary: string, now: number): CompactionNotice {
  return {
    operationId,
    origin: "replay",
    summary,
    trigger: "manual",
    status: "completed",
    startedAt: now,
    settledAt: now,
    contextBefore: null,
    contextAfter: null,
    failureReason: null,
  };
}

export function attachSummary(notice: CompactionNotice, summary: string): CompactionNotice {
  return notice.summary ? notice : { ...notice, summary };
}

export function settleNotice(
  notice: CompactionNotice,
  settlement: CompactionSettlement,
  now: number,
): CompactionNotice {
  if (notice.status !== "running") return notice;
  const settled = { ...notice, settledAt: now };
  switch (settlement.status) {
    case "completed":
      return {
        ...settled,
        status: "completed",
        contextAfter: settlement.contextAfter ?? notice.contextAfter,
        summary: settlement.summary ?? notice.summary,
      };
    case "failed":
      return { ...settled, status: "failed", failureReason: settlement.reason };
    case "cancelled":
      return { ...settled, status: "cancelled" };
    default: {
      const exhaustive: never = settlement;
      return exhaustive;
    }
  }
}

export function recordNoticeUsage(notice: CompactionNotice, usage: ContextUsage | null): CompactionNotice {
  if (notice.status !== "running" || !usage) return notice;
  return { ...notice, contextAfter: usage };
}

function percentOf(usage: ContextUsage): number {
  return Math.round(contextUsageRatio(usage) * PERCENT_SCALE);
}

export interface CompactionSummary {
  readonly beforePercent: number;
  readonly afterPercent: number;
  readonly freedTokens: number;
  readonly reductionPercent: number;
}

export function compactionSummary(notice: CompactionNotice): CompactionSummary | null {
  const { contextBefore, contextAfter } = notice;
  if (!contextBefore || !contextAfter) return null;
  const freedTokens = Math.max(0, contextBefore.contextTokens - contextAfter.contextTokens);
  return {
    beforePercent: percentOf(contextBefore),
    afterPercent: percentOf(contextAfter),
    freedTokens,
    reductionPercent:
      contextBefore.contextTokens > 0 ? Math.round((freedTokens / contextBefore.contextTokens) * PERCENT_SCALE) : 0,
  };
}

export function usageChangeLabel(notice: CompactionNotice): string | null {
  const summary = compactionSummary(notice);
  return summary ? `${summary.beforePercent}% → ${summary.afterPercent}%` : null;
}

export function failureDetail(notice: CompactionNotice): string | null {
  const reason = notice.failureReason?.replace(/\s+/g, " ").trim();
  if (!reason) return null;
  return reason.length <= MAX_NOTICE_DETAIL_CHARS ? reason : `${reason.slice(0, MAX_NOTICE_DETAIL_CHARS - 1)}…`;
}
