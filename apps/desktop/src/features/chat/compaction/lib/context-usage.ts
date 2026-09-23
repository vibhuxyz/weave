import type { ContextUsage, UsageCarrier } from "./types";

export function toContextUsage(contextTokens: unknown, contextLimit: unknown): ContextUsage | null {
  if (typeof contextTokens !== "number" || typeof contextLimit !== "number") return null;
  if (!Number.isFinite(contextTokens) || !Number.isFinite(contextLimit)) return null;
  if (contextTokens < 0 || contextLimit <= 0) return null;
  return { contextTokens, contextLimit };
}

export function latestContextUsage(turns: readonly UsageCarrier[]): ContextUsage | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const usage = turns[index]?.usage;
    const snapshot = toContextUsage(usage?.contextUsed, usage?.contextSize);
    if (snapshot) return snapshot;
  }
  return null;
}

export function contextUsageRatio(usage: ContextUsage | null): number {
  if (!usage) return 0;
  return Math.min(1, Math.max(0, usage.contextTokens / usage.contextLimit));
}
