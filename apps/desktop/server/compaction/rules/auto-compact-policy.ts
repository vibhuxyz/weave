import { DEFAULT_AUTO_COMPACT_THRESHOLD } from "../constants.ts";
import type { SessionCompactionState } from "../types.ts";

const DISABLED_THRESHOLD = 1;

export type NormalizedThreshold = { readonly kind: "enabled"; readonly value: number } | { readonly kind: "off" };

export function normalizeThreshold(raw: unknown): NormalizedThreshold {
  if (raw === undefined) return { kind: "enabled", value: DEFAULT_AUTO_COMPACT_THRESHOLD };
  if (typeof raw !== "number" || !Number.isFinite(raw)) return { kind: "off" };
  if (raw <= 0 || raw >= DISABLED_THRESHOLD) return { kind: "off" };
  return { kind: "enabled", value: raw };
}

export function shouldAutoCompact(state: SessionCompactionState, rawThreshold: unknown): boolean {
  const threshold = normalizeThreshold(rawThreshold);
  if (threshold.kind === "off") return false;
  if (!state.supportsCompaction || state.isContextFromCompaction) return false;
  const context = state.context;
  if (!context) return false;
  return context.contextTokens / context.contextLimit > threshold.value;
}
