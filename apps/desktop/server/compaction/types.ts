import type { ContextSnapshot } from "../shared/index.ts";

export type { CompactionTrigger, ContextSnapshot } from "../shared/index.ts";

export type CompactionOutcome =
  | { readonly status: "completed"; readonly contextAfter: ContextSnapshot | null }
  | { readonly status: "failed"; readonly reason: string }
  | { readonly status: "cancelled" };

export interface SessionCompactionState {
  readonly supportsCompaction: boolean;
  readonly context: ContextSnapshot | null;
  readonly isContextFromCompaction: boolean;
}

export type EngineCompactionStatus = "in_progress" | "completed" | "failed";

export interface ActiveCompaction {
  readonly operationId: string;
  readonly sessionId: string;
  readonly engineText: string;
  readonly engineStatus: EngineCompactionStatus | null;
  readonly contextAfter: ContextSnapshot | null;
}

export interface CompactableSession {
  readonly sessionId: string;
  prompt(
    blocks: { type: "text"; text: string }[],
    options?: { readonly stallTimeoutMs?: number },
  ): Promise<{ stopReason: string }>;
}
