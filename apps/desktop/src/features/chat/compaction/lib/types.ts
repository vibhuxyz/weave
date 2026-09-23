export interface ContextUsage {
  readonly contextTokens: number;
  readonly contextLimit: number;
}

export type CompactionTrigger = "manual" | "automatic";

export type CompactionStatus = "running" | "completed" | "failed" | "cancelled";

export type NoticeOrigin = "live" | "replay";

export interface CompactionNotice {
  readonly operationId: string;
  readonly origin: NoticeOrigin;
  readonly summary: string | null;
  readonly trigger: CompactionTrigger;
  readonly status: CompactionStatus;
  readonly startedAt: number;
  readonly settledAt: number | null;
  readonly contextBefore: ContextUsage | null;
  readonly contextAfter: ContextUsage | null;
  readonly failureReason: string | null;
}

export type CompactionSettlement =
  | { readonly status: "completed"; readonly contextAfter: ContextUsage | null; readonly summary: string | null }
  | { readonly status: "failed"; readonly reason: string }
  | { readonly status: "cancelled" };

export interface UsageCarrier {
  readonly usage?: {
    readonly contextUsed?: number;
    readonly contextSize?: number;
  };
}
